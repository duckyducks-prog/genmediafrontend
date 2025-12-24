import { Filter, GlProgram } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uIntensity;
uniform float uSize;
uniform float uSeed;
uniform float uShadows;
uniform float uHighlights;
uniform float uMidtonesBias;
uniform float uWidth;
uniform float uHeight;

// High-quality hash functions - no visible patterns
// Based on Dave Hoskins' hash functions
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Second hash for variation
float hash12b(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673U, 3812015801U);
  uint n = (q.x ^ q.y) * 1597334673U;
  return float(n) * (1.0 / float(0xffffffffU));
}

// Combine two hashes for better randomness
float grain(vec2 pixelCoord, float seed) {
  float g1 = hash12(pixelCoord + seed);
  float g2 = hash12b(pixelCoord + seed + 127.1);
  return mix(g1, g2, 0.5);
}

void main() {
  vec4 color = texture(uTexture, vTextureCoord);

  // Convert to actual pixel coordinates
  vec2 dimensions = vec2(uWidth, uHeight);
  vec2 pixelCoord = floor(vTextureCoord * dimensions);

  // Apply size (larger size = fewer unique grain pixels = coarser grain)
  vec2 grainCoord = floor(pixelCoord / uSize);
  
  // Per-pixel grain value
  float grainValue = grain(grainCoord, uSeed);
  
  // Center around 0 (-0.5 to +0.5 range)
  grainValue = grainValue - 0.5;
  
  // Calculate luminance
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  
  // Luminance-based masks
  // Shadows: full effect at luma=0, fades by luma=0.3
  float shadowMask = (1.0 - smoothstep(0.0, 0.3, luma)) * uShadows;
  
  // Highlights: full effect at luma=1, fades by luma=0.7
  float highlightMask = (1.0 - smoothstep(0.7, 1.0, 1.0 - luma)) * uHighlights;
  
  // Midtones: peaks at luma=0.5, fades toward 0 and 1
  float midtoneMask = (1.0 - abs(luma - 0.5) * 2.0) * uMidtonesBias;
  
  // Combine masks (take maximum influence)
  float lumaMask = max(max(shadowMask, highlightMask), midtoneMask);
  lumaMask = clamp(lumaMask, 0.1, 1.0); // Minimum 10% to always have some grain
  
  // Final grain amount
  float grainAmount = uIntensity * 0.15 * lumaMask;
  
  // Apply grain to RGB equally
  color.rgb += grainValue * grainAmount;
  
  // Clamp to valid range
  color.rgb = clamp(color.rgb, 0.0, 1.0);
  
  finalColor = color;
}
`;

export interface FilmGrainFilterOptions {
  intensity?: number;      // 0-100 (default 50)
  size?: number;           // 1-4, where 1=fine, 4=coarse (default 1)
  shadows?: number;        // 0-100 (default 30)
  highlights?: number;     // 0-100 (default 30)
  midtonesBias?: number;   // 0-100 (default 80)
  width?: number;          // Image width in pixels
  height?: number;         // Image height in pixels
}

export class FilmGrainFilter extends Filter {
  private _width: number;
  private _height: number;
  private _uniforms: Record<string, any>;

  constructor(options: FilmGrainFilterOptions = {}) {
    const width = options.width ?? 1920;
    const height = options.height ?? 1080;

    console.log('[FilmGrainFilter] Initializing with options:', {
      intensity: options.intensity,
      size: options.size,
      shadows: options.shadows,
      highlights: options.highlights,
      midtonesBias: options.midtonesBias,
      width,
      height,
    });

    const glProgram = GlProgram.from({
      vertex,
      fragment,
      name: 'film-grain-filter',
    });

    const uniforms = {
      uIntensity: (options.intensity ?? 50) / 100,
      uSize: options.size ?? 1.0,
      uSeed: Math.random() * 10000,
      uShadows: (options.shadows ?? 30) / 100,
      uHighlights: (options.highlights ?? 30) / 100,
      uMidtonesBias: (options.midtonesBias ?? 80) / 100,
      uWidth: width,
      uHeight: height,
    };

    super({
      glProgram,
      resources: {
        filmGrainUniforms: uniforms,
      },
    });

    this._uniforms = uniforms;
    this._width = width;
    this._height = height;

    console.log('[FilmGrainFilter] Filter created successfully');
  }

  // --- Intensity (0-100) ---
  get intensity(): number {
    return this._uniforms.uIntensity * 100;
  }
  set intensity(value: number) {
    this._uniforms.uIntensity = Math.max(0, Math.min(100, value)) / 100;
  }

  // --- Size (1 = fine, 2 = medium, 3-4 = coarse) ---
  get size(): number {
    return this._uniforms.uSize;
  }
  set size(value: number) {
    this._uniforms.uSize = Math.max(1, Math.min(4, value));
  }

  // --- Shadows (0-100) ---
  get shadows(): number {
    return this._uniforms.uShadows * 100;
  }
  set shadows(value: number) {
    this._uniforms.uShadows = Math.max(0, Math.min(100, value)) / 100;
  }

  // --- Highlights (0-100) ---
  get highlights(): number {
    return this._uniforms.uHighlights * 100;
  }
  set highlights(value: number) {
    this._uniforms.uHighlights = Math.max(0, Math.min(100, value)) / 100;
  }

  // --- Midtones Bias (0-100) ---
  get midtonesBias(): number {
    return this._uniforms.uMidtonesBias * 100;
  }
  set midtonesBias(value: number) {
    this._uniforms.uMidtonesBias = Math.max(0, Math.min(100, value)) / 100;
  }

  // --- Dimensions ---
  get width(): number {
    return this._width;
  }
  set width(value: number) {
    this._width = value;
    this._uniforms.uWidth = value;
  }

  get height(): number {
    return this._height;
  }
  set height(value: number) {
    this._height = value;
    this._uniforms.uHeight = value;
  }

  setDimensions(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._uniforms.uWidth = width;
    this._uniforms.uHeight = height;
  }

  // --- Randomize seed (for different grain pattern) ---
  randomizeSeed(): void {
    this._uniforms.uSeed = Math.random() * 10000;
  }

  // --- Presets ---
  static presets = {
    subtle: {
      intensity: 20,
      size: 1,
      shadows: 20,
      highlights: 20,
      midtonesBias: 90,
    },
    standard: {
      intensity: 50,
      size: 1,
      shadows: 30,
      highlights: 30,
      midtonesBias: 80,
    },
    heavy35mm: {
      intensity: 70,
      size: 2,
      shadows: 50,
      highlights: 40,
      midtonesBias: 70,
    },
    super8: {
      intensity: 85,
      size: 3,
      shadows: 60,
      highlights: 50,
      midtonesBias: 60,
    },
    digital: {
      intensity: 30,
      size: 1,
      shadows: 80,  // Digital noise shows more in shadows
      highlights: 10,
      midtonesBias: 40,
    },
  };

  applyPreset(presetName: keyof typeof FilmGrainFilter.presets): void {
    const preset = FilmGrainFilter.presets[presetName];
    if (preset) {
      this.intensity = preset.intensity;
      this.size = preset.size;
      this.shadows = preset.shadows;
      this.highlights = preset.highlights;
      this.midtonesBias = preset.midtonesBias;
    }
  }
}
