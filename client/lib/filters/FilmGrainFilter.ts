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

  // Pseudo-random function
  float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Value noise for more organic look
  float noise(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    
    // Four corners
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    // Smooth interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  // Multi-scale grain
  float filmGrain(vec2 uv, float scale) {
    float fineGrain = noise((uv + uSeed) * scale * 2.0);
    float coarseGrain = noise((uv + uSeed) * scale * 0.5);
    return mix(fineGrain, coarseGrain, 0.3);
  }

  void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    
    // Calculate luminance
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    // Luminance-based intensity masks
    float shadowMask = smoothstep(0.0, 0.3, luma) * uShadows;
    float highlightMask = smoothstep(1.0, 0.7, luma) * uHighlights;
    float midtoneMask = (1.0 - abs(luma - 0.5) * 2.0) * uMidtonesBias;
    
    // Combine masks
    float lumaMask = max(max(shadowMask, highlightMask), midtoneMask);
    lumaMask = clamp(lumaMask, 0.0, 1.0);
    
    // Generate grain
    float grainScale = 512.0 / uSize;
    float grain = filmGrain(vTextureCoord, grainScale);
    
    // Center around 0 (-0.5 to 0.5 range)
    grain = (grain - 0.5);
    
    // Apply grain with luminance mask
    float grainAmount = uIntensity * 0.15 * lumaMask;
    color.rgb += grain * grainAmount;
    
    // Clamp to valid range
    color.rgb = clamp(color.rgb, 0.0, 1.0);
    
    finalColor = color;
  }
`;

export interface FilmGrainFilterOptions {
  intensity?: number;    // 0-100
  size?: number;         // 0.5-3 (grain particle size multiplier)
  shadows?: number;      // 0-100
  highlights?: number;   // 0-100
  midtonesBias?: number; // 0-100
}

export class FilmGrainFilter extends Filter {
  constructor(options: FilmGrainFilterOptions = {}) {
    const glProgram = GlProgram.from({
      vertex,
      fragment,
      name: 'film-grain-filter',
    });

    super({
      glProgram,
      resources: {
        filmGrainUniforms: {
          uIntensity: { value: (options.intensity ?? 50) / 100, type: 'f32' },
          uSize: { value: options.size ?? 1.0, type: 'f32' },
          uSeed: { value: Math.random() * 100, type: 'f32' },
          uShadows: { value: (options.shadows ?? 30) / 100, type: 'f32' },
          uHighlights: { value: (options.highlights ?? 30) / 100, type: 'f32' },
          uMidtonesBias: { value: (options.midtonesBias ?? 80) / 100, type: 'f32' },
        },
      },
    });
  }

  get intensity(): number {
    return this.resources.filmGrainUniforms.uniforms.uIntensity * 100;
  }
  set intensity(value: number) {
    this.resources.filmGrainUniforms.uniforms.uIntensity = value / 100;
  }

  get size(): number {
    return this.resources.filmGrainUniforms.uniforms.uSize;
  }
  set size(value: number) {
    this.resources.filmGrainUniforms.uniforms.uSize = value;
  }

  get shadows(): number {
    return this.resources.filmGrainUniforms.uniforms.uShadows * 100;
  }
  set shadows(value: number) {
    this.resources.filmGrainUniforms.uniforms.uShadows = value / 100;
  }

  get highlights(): number {
    return this.resources.filmGrainUniforms.uniforms.uHighlights * 100;
  }
  set highlights(value: number) {
    this.resources.filmGrainUniforms.uniforms.uHighlights = value / 100;
  }

  get midtonesBias(): number {
    return this.resources.filmGrainUniforms.uniforms.uMidtonesBias * 100;
  }
  set midtonesBias(value: number) {
    this.resources.filmGrainUniforms.uniforms.uMidtonesBias = value / 100;
  }

  // Call this to randomize grain pattern
  randomizeSeed(): void {
    this.resources.filmGrainUniforms.uniforms.uSeed = Math.random() * 100;
  }
}
