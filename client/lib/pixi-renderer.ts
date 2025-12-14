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
      return new NoiseFilter(config.params.noise);
    
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
 */
function createVignetteFilter(params: Record<string, number>): Filter {
  // Simple vignette using Filter.from() with custom shader
  const fragment = `
    precision mediump float;
    varying vec2 vTextureCoord;
    uniform sampler2D uSampler;
    uniform float uSize;
    uniform float uAmount;
    
    void main() {
      vec4 color = texture2D(uSampler, vTextureCoord);
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(vTextureCoord, center);
      float vignette = smoothstep(uSize, uSize - 0.5, dist);
      color.rgb *= mix(1.0, vignette, uAmount);
      gl_FragColor = color;
    }
  `;
  
  const vertex = `
    attribute vec2 aPosition;
    varying vec2 vTextureCoord;
    
    uniform vec4 uInputSize;
    uniform vec4 uOutputFrame;
    uniform vec4 uOutputTexture;
    
    void main() {
      gl_Position = vec4((aPosition * 2.0) - 1.0, 0.0, 1.0);
      vTextureCoord = aPosition;
    }
  `;
  
  return Filter.from({
    vertex,
    fragment,
    uniforms: {
      uSize: params.size || 0.5,
      uAmount: params.amount || 0.5,
    },
  });
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
    const texture = await Texture.from(imageSource, {
      resourceOptions: { crossOrigin: 'anonymous' },
    });

    // Resize app to match image dimensions
    app.renderer.resize(texture.width, texture.height);

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
