import { Application, Sprite, Texture, Filter, ColorMatrixFilter, BlurFilter, NoiseFilter } from 'pixi.js';
import { AdjustmentFilter } from 'pixi-filters';
import { FilterConfig, FILTER_DEFINITIONS } from './pixi-filter-configs';

/**
 * Singleton PixiJS Application to avoid WebGL context exhaustion
 * Browsers limit the number of active WebGL contexts (typically 8-16)
 *
 * Uses promise-based initialization to prevent race conditions where
 * multiple concurrent calls could create multiple Application instances.
 */
let sharedApp: Application | null = null;
let sharedAppInitPromise: Promise<Application> | null = null;

async function getSharedApp(): Promise<Application> {
  // Return existing app if already initialized
  if (sharedApp) {
    return sharedApp;
  }

  // Return in-flight initialization promise if already starting
  if (sharedAppInitPromise) {
    return sharedAppInitPromise;
  }

  // Start new initialization with error recovery
  sharedAppInitPromise = (async () => {
    try {
      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        width: 1024,
        height: 1024,
        preference: 'webgl',
      });

      sharedApp = app;
      sharedAppInitPromise = null; // Clear promise after success
      return app;
    } catch (error) {
      sharedAppInitPromise = null; // Clear promise to allow retry
      throw new Error(`Failed to initialize PixiJS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  })();

  return sharedAppInitPromise;
}

/**
 * Disposes the shared PixiJS application and clears all references.
 * Call this to force cleanup of WebGL context (e.g., on page unload or reset).
 * After calling this, the next render will create a new Application.
 */
export function disposeSharedPixiApp(): void {
  if (sharedApp) {
    try {
      sharedApp.destroy(true, { children: true, texture: true, textureSource: true });
    } catch (error) {
      console.error('Error disposing PixiJS app:', error);
    }
    sharedApp = null;
  }
  sharedAppInitPromise = null;
}

/**
 * Creates a PixiJS Filter instance from a FilterConfig
 * This is the ONLY place where Filter instances are created
 */
function createFilterFromConfig(config: FilterConfig): Filter {
  const def = FILTER_DEFINITIONS[config.type];
  
  switch (def.filterClass) {
    case 'AdjustmentFilter':
      return new AdjustmentFilter(config.params);
    
    case 'BlurFilter':
      return new BlurFilter(config.params);
    
    case 'ColorMatrixFilter': {
      const filter = new ColorMatrixFilter();
      // ColorMatrixFilter uses methods, not constructor params
      if (config.type === 'hueSaturation') {
        filter.hue(config.params.hue || 0, false);
        filter.saturate(config.params.saturation || 0);
      }
      return filter;
    }
    
    case 'NoiseFilter':
      return new NoiseFilter({ noise: config.params.noise });
    
    case 'Custom':
      // Handle custom filters like vignette
      if (config.type === 'vignette') {
        return createVignetteFilter(config.params);
      }
      throw new Error(`Custom filter ${config.type} not implemented`);
    
    default:
      throw new Error(`Unknown filter class: ${def.filterClass}`);
  }
}

/**
 * Custom vignette filter implementation
 * Uses ColorMatrixFilter as a simple approximation
 */
function createVignetteFilter(params: Record<string, number>): Filter {
  // Use brightness reduction as a simple vignette approximation
  const filter = new ColorMatrixFilter();
  const amount = params.amount || 0.5;
  filter.brightness(1 - (amount * 0.3), false);
  return filter;
}

/**
 * Render queue to serialize concurrent render operations.
 * Prevents multiple renders from modifying the shared app simultaneously.
 */
let renderQueue = Promise.resolve();

/**
 * Internal function that performs the actual rendering.
 * Should only be called through the render queue to prevent concurrent access.
 */
async function performRender(
  imageSource: string,
  filterConfigs: FilterConfig[]
): Promise<string> {
  // 1. Get shared PixiJS application (reuses WebGL context)
  const app = await getSharedApp();

  // Check for WebGL context loss before attempting render
  if ((app.renderer as any).gl?.isContextLost?.()) {
    throw new Error('WebGL context lost - please refresh the page to recover');
  }

  // 2. Load image into HTMLImageElement with timeout (prevent hanging)
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await Promise.race([
    new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image - check image source or CORS policy'));
      img.src = imageSource;
    }),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Image load timeout (10s) - image may be too large or network is slow')), 10000)
    )
  ]);

  // 3. Create texture from the loaded image
  const texture = Texture.from(img);

  // Ensure texture is valid
  if (!texture || !texture.source) {
    throw new Error('Failed to create texture from image - texture or source is invalid');
  }

  // Resize app to match image dimensions
  const width = img.width || 1024;
  const height = img.height || 1024;
  app.renderer.resize(width, height);

  // 4. Clear the stage from previous renders
  app.stage.removeChildren();

  // 5. Create sprite from texture
  const sprite = new Sprite(texture);
  sprite.width = width;
  sprite.height = height;

  // 6. Build filter array from configs (Layer 2 logic)
  if (filterConfigs.length > 0) {
    const filters = filterConfigs.map(config => createFilterFromConfig(config));
    sprite.filters = filters; // PixiJS applies all filters on GPU
  }

  // 7. Add to stage and render
  app.stage.addChild(sprite);
  app.renderer.render(app.stage);

  // 8. Extract as base64 (Layer 3 logic)
  const canvas = app.canvas as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Failed to get canvas from app');
  }

  const dataURL = canvas.toDataURL('image/png');

  // 9. Cleanup resources (keep the app/context alive)
  // Destroy filters explicitly to free GPU resources (shaders, uniforms, buffers)
  if (sprite.filters && Array.isArray(sprite.filters)) {
    sprite.filters.forEach(filter => {
      if (filter && typeof filter.destroy === 'function') {
        try {
          filter.destroy();
        } catch (error) {
          console.warn('Failed to destroy filter:', error);
        }
      }
    });
    sprite.filters = null;
  }

  // Destroy sprite and its children (but preserve texture for proper cleanup)
  sprite.destroy({ children: true, texture: false, baseTexture: false });

  // Destroy texture and its base texture to free GPU memory
  texture.destroy(true);

  return dataURL;
}

/**
 * Renders an image with PixiJS filter chain (PUBLIC API).
 * Uses a queue to serialize renders and prevent concurrent access to shared app.
 *
 * THIS is Layer 2 from backend spec
 *
 * @param imageSource - Base64 data URI or URL
 * @param filterConfigs - Array of filter configs (from modifier nodes)
 * @returns Promise<string> - Base64 data URI of rendered result
 */
export async function renderWithPixi(
  imageSource: string,
  filterConfigs: FilterConfig[]
): Promise<string> {
  // Enqueue this render to prevent concurrent modification of shared app
  return new Promise<string>((resolve, reject) => {
    renderQueue = renderQueue
      .then(() => performRender(imageSource, filterConfigs))
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Utility to check if PixiJS/WebGL is supported
 */
export function isPixiSupported(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl') || testCanvas.getContext('webgl2');
    return !!gl;
  } catch {
    return false;
  }
}
