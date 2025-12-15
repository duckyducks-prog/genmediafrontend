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
      // Check WebGL support before attempting to create app
      if (!isPixiSupported()) {
        throw new Error('WebGL is not supported in this browser - PixiJS requires WebGL');
      }

      // Pixi v8: Create app instance, then initialize with options
      // preserveDrawingBuffer is CRITICAL for canvas readback (toDataURL/extract)
      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        width: 1024,
        height: 1024,
        preserveDrawingBuffer: true, // Essential for extract/toDataURL to work
      });

      // Add WebGL context loss/restore event listeners for better recovery
      const canvas = app.canvas as HTMLCanvasElement;
      if (canvas) {
        canvas.addEventListener('webglcontextlost', (event) => {
          console.error('[PixiJS] WebGL context lost! Preventing default to allow recovery.');
          event.preventDefault(); // Prevent browser from giving up on context
        });

        canvas.addEventListener('webglcontextrestored', () => {
          console.log('[PixiJS] WebGL context restored! Disposing and allowing re-initialization.');
          // Dispose the app so next render will create a fresh one
          disposeSharedPixiApp();
        });
      }

      console.log('[PixiJS] Shared application initialized successfully');
      sharedApp = app;
      sharedAppInitPromise = null; // Clear promise after success
      return app;
    } catch (error) {
      console.error('[PixiJS] Initialization failed:', error);
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
    case 'AdjustmentFilter': {
      // Brightness/Contrast node uses UI sliders -1..1, must map to filter 0..2
      // This is necessary because:
      // - UI sliders use -1 to 1 with 0 = "no change" (user-friendly)
      // - AdjustmentFilter expects 0 to 2 with 1 = "no change" (filter API)
      // Mapping: filterValue = sliderValue + 1
      if (config.type === 'brightness') {
        const rawB = config.params.brightness ?? 0;
        const rawC = config.params.contrast ?? 0;

        // Map: slider -1 → filter 0 (dark), slider 0 → filter 1 (normal), slider 1 → filter 2 (bright)
        const mapValue = (v: number) => Math.min(Math.max(v + 1, 0), 2);

        return new AdjustmentFilter({
          brightness: mapValue(rawB),
          contrast: mapValue(rawC),
        });
      }

      // Sharpen uses gamma 0-3 range (pass through unchanged)
      return new AdjustmentFilter(config.params);
    }
    
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
    // Automatically dispose the app to allow fresh initialization on next call
    disposeSharedPixiApp();
    throw new Error(
      'WebGL context was lost (GPU reset or too many contexts). ' +
      'The app will automatically recover on the next render attempt. ' +
      'If this persists, try refreshing the page.'
    );
  }

  // 2. Load image into HTMLImageElement with timeout (prevent hanging)
  const img = new Image();

  // Only set crossOrigin for remote URLs (not data: URIs)
  if (!imageSource.startsWith('data:')) {
    img.crossOrigin = 'anonymous';
  }

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

  // Resize app to match image dimensions (with max limits to prevent GPU OOM)
  const MAX_DIMENSION = 4096; // Reasonable limit for most GPUs
  let width = img.width || 1024;
  let height = img.height || 1024;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
    console.warn(`[PixiJS] Image dimensions exceed ${MAX_DIMENSION}px, scaling down to ${width}x${height}`);
  }

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

  // 8. Extract as base64 using PixiJS extract API (Layer 3 logic)
  // Using renderer.extract is more reliable than canvas.toDataURL for WebGL
  let dataURL: string;

  try {
    // PixiJS extract API handles WebGL readback properly
    // In Pixi v8, base64() takes only the target parameter (format is PNG by default)
    dataURL = await app.renderer.extract.base64(app.stage);
    console.log('[PixiJS] Successfully extracted rendered image');
  } catch (extractError) {
    // Handle CORS/SecurityError specifically
    if (extractError instanceof DOMException && extractError.name === 'SecurityError') {
      throw new Error(
        'Canvas extraction blocked by CORS policy. ' +
        'The image server must send Access-Control-Allow-Origin header, ' +
        'or use a proxied/local image. Error: ' + extractError.message
      );
    }

    // Re-throw other errors
    throw new Error(`Failed to extract canvas: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
  }

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
  sprite.destroy({ children: true, texture: false });

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
