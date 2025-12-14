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
  });

  try {
    // 2. Load image as PixiJS texture
    const texture = await Texture.from(imageSource);

    // Ensure texture is valid
    if (!texture || !texture.source) {
      throw new Error('Failed to load texture from image source');
    }

    // Resize app to match image dimensions
    const width = texture.source.width || texture.width || 1024;
    const height = texture.source.height || texture.height || 1024;
    app.renderer.resize(width, height);

    // 3. Create sprite from texture
    const sprite = new Sprite(texture);

    // 4. Build filter array from configs (Layer 2 logic)
    if (filterConfigs.length > 0) {
      const filters = filterConfigs.map(config => createFilterFromConfig(config));
      sprite.filters = filters; // PixiJS applies all filters on GPU
    }

    // 5. Add to stage and render
    app.stage.addChild(sprite);
    app.renderer.render(app.stage);

    // 6. Extract as base64 (Layer 3 logic)
    const canvas = app.renderer.extract.canvas(sprite);
    const dataURL = canvas.toDataURL('image/png');

    return dataURL;
  } finally {
    // 7. Cleanup to prevent memory leaks
    app.destroy(true, { children: true, texture: true, textureSource: true });
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
