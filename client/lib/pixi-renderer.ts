import { Application, Sprite, Texture, Filter, ColorMatrixFilter, BlurFilter, NoiseFilter } from 'pixi.js';
import { AdjustmentFilter } from 'pixi-filters';
import { FilterConfig, FILTER_DEFINITIONS } from './pixi-filter-configs';

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
 * Renders an image with PixiJS filter chain
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
  // 1. Create off-screen PixiJS application (headless)
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    width: 1024, // Will be adjusted to image size
    height: 1024,
    preference: 'webgl', // Force WebGL for better compatibility
  });

  try {
    // 2. Load image into HTMLImageElement first (for base64 data URIs)
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSource;
    });

    // 3. Create texture from the loaded image
    const texture = Texture.from(img);

    // Ensure texture is valid
    if (!texture || !texture.source) {
      throw new Error('Failed to create texture from image');
    }

    // Resize app to match image dimensions
    const width = img.width || 1024;
    const height = img.height || 1024;
    app.renderer.resize(width, height);

    // 4. Create sprite from texture
    const sprite = new Sprite(texture);
    sprite.width = width;
    sprite.height = height;

    // 5. Build filter array from configs (Layer 2 logic)
    if (filterConfigs.length > 0) {
      const filters = filterConfigs.map(config => createFilterFromConfig(config));
      sprite.filters = filters; // PixiJS applies all filters on GPU
    }

    // 6. Add to stage and render
    app.stage.addChild(sprite);
    app.renderer.render(app.stage);

    // 7. Extract as base64 (Layer 3 logic)
    // In PixiJS v8, the canvas is accessed via app.canvas
    const canvas = app.canvas as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Failed to get canvas from app');
    }
    const dataURL = canvas.toDataURL('image/png');

    // Cleanup texture (but not the source image)
    texture.destroy(false);

    return dataURL;
  } finally {
    // 8. Cleanup to prevent memory leaks
    app.destroy(true, { children: true });
  }
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
