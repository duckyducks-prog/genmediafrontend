import {
  Application,
  Sprite,
  Texture,
  Filter,
  ColorMatrixFilter,
  BlurFilter,
  NoiseFilter,
  Rectangle,
} from "pixi.js";
import { AdjustmentFilter } from "pixi-filters";
import { FilterConfig, FILTER_DEFINITIONS } from "./pixi-filter-configs";
import { FilmGrainFilter } from "./filters/FilmGrainFilter";

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
        throw new Error(
          "WebGL is not supported in this browser - PixiJS requires WebGL",
        );
      }

      // Pixi v8: Create app instance, then initialize with options
      // preserveDrawingBuffer is CRITICAL for canvas readback (toDataURL/extract)
      const app = new Application();

      console.log("[PixiJS] Calling app.init()...");
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        width: 1024,
        height: 1024,
        preserveDrawingBuffer: true, // Essential for extract/toDataURL to work
      });

      console.log("[PixiJS] app.init() completed");

      // Verify renderer is ready
      if (!app.renderer) {
        throw new Error("PixiJS renderer not available after init");
      }

      // Verify canvas is ready
      const canvas = app.canvas as HTMLCanvasElement;
      if (!canvas) {
        throw new Error("PixiJS canvas not available after init");
      }

      console.log("[PixiJS] Renderer and canvas verified");

      // Add WebGL context loss/restore event listeners for better recovery
      canvas.addEventListener("webglcontextlost", (event) => {
        console.error(
          "[PixiJS] WebGL context lost! Preventing default to allow recovery.",
        );
        event.preventDefault(); // Prevent browser from giving up on context
      });

      canvas.addEventListener("webglcontextrestored", () => {
        console.log(
          "[PixiJS] WebGL context restored! Disposing and allowing re-initialization.",
        );
        // Dispose the app so next render will create a fresh one
        disposeSharedPixiApp();
      });

      console.log("[PixiJS] Shared application initialized successfully");
      sharedApp = app;
      sharedAppInitPromise = null; // Clear promise after success
      return app;
    } catch (error) {
      console.error("[PixiJS] Initialization failed:", error);
      sharedAppInitPromise = null; // Clear promise to allow retry
      throw new Error(
        `Failed to initialize PixiJS: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
      sharedApp.destroy(true, {
        children: true,
        texture: true,
        textureSource: true,
      });
    } catch (error) {
      console.error("Error disposing PixiJS app:", error);
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
    case "AdjustmentFilter": {
      // Brightness/Contrast node uses UI sliders -1..1, must map to filter 0..2
      // This is necessary because:
      // - UI sliders use -1 to 1 with 0 = "no change" (user-friendly)
      // - AdjustmentFilter expects 0 to 2 with 1 = "no change" (filter API)
      // Mapping: filterValue = sliderValue + 1
      if (config.type === "brightness") {
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

    case "BlurFilter":
      return new BlurFilter(config.params);

    case "ColorMatrixFilter": {
      const filter = new ColorMatrixFilter();
      // ColorMatrixFilter uses methods, not constructor params
      if (config.type === "hueSaturation") {
        filter.hue(config.params.hue || 0, false);
        filter.saturate(config.params.saturation || 0);
      }
      return filter;
    }

    case "NoiseFilter":
      return new NoiseFilter({ noise: config.params.noise });

    case "FilmGrainFilter":
      return new FilmGrainFilter({
        intensity: config.params.intensity,
        size: config.params.size,
        shadows: config.params.shadows,
        highlights: config.params.highlights,
        midtonesBias: config.params.midtonesBias,
      });

    case "Custom":
      // Handle custom filters like vignette
      if (config.type === "vignette") {
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
  filter.brightness(1 - amount * 0.3, false);
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
  filterConfigs: FilterConfig[],
): Promise<string> {
  console.log("[performRender] Starting render:", {
    imageSourceLength: imageSource?.length,
    imageSourcePrefix: imageSource?.substring(0, 30),
    filterCount: filterConfigs.length,
    filters: filterConfigs.map((f) => ({ type: f.type, params: f.params })),
  });

  // 1. Get shared PixiJS application (reuses WebGL context)
  let app;
  try {
    app = await getSharedApp();
    console.log("[performRender] Pixi app obtained successfully");
  } catch (error) {
    console.error("[performRender] Failed to get Pixi app:", error);
    throw error;
  }

  // Check for WebGL context loss before attempting render
  if ((app.renderer as any).gl?.isContextLost?.()) {
    // Automatically dispose the app to allow fresh initialization on next call
    disposeSharedPixiApp();
    throw new Error(
      "WebGL context was lost (GPU reset or too many contexts). " +
        "The app will automatically recover on the next render attempt. " +
        "If this persists, try refreshing the page.",
    );
  }

  // 2. Load image into HTMLImageElement with timeout (prevent hanging)
  console.log("[performRender] Creating HTMLImageElement");
  const img = new Image();

  // Only set crossOrigin for remote URLs (not data: URIs)
  if (!imageSource.startsWith("data:")) {
    console.log("[performRender] Setting crossOrigin for remote URL");
    img.crossOrigin = "anonymous";
  } else {
    console.log("[performRender] Using data URI (no crossOrigin needed)");
  }

  console.log("[performRender] Starting image load");
  try {
    // Use timeout with proper cleanup to avoid race condition
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        img.onload = () => {
          console.log("[performRender] Image loaded successfully");
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          resolve();
        };
        img.onerror = (e) => {
          console.error("[performRender] Image load error:", e);
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          reject(
            new Error(
              "Failed to load image - check image source or CORS policy",
            ),
          );
        };
        img.src = imageSource;
      }),
      new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => {
          console.error("[performRender] Image load timeout");
          reject(
            new Error(
              "Image load timeout (10s) - image may be too large or network is slow",
            ),
          );
        }, 10000);
      }),
    ]);
  } catch (error) {
    console.error("[performRender] Image load failed:", error);
    throw error;
  }

  // 3. Create texture from the loaded image
  let texture = Texture.from(img);

  // Ensure texture is valid
  if (!texture || !texture.source) {
    throw new Error(
      "Failed to create texture from image - texture or source is invalid",
    );
  }

  // Get original image dimensions
  const MAX_DIMENSION = 4096; // Reasonable limit for most GPUs
  let width = img.width || 1024;
  let height = img.height || 1024;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
    console.warn(
      `[PixiJS] Image dimensions exceed ${MAX_DIMENSION}px, scaling down to ${width}x${height}`,
    );
  }

  // 4. Handle crop BEFORE creating sprite (crop the texture itself)
  const cropConfig = filterConfigs.find((f) => f.type === "crop");
  const otherFilters = filterConfigs.filter((f) => f.type !== "crop");

  if (cropConfig) {
    const cropX = Math.max(0, Math.min(cropConfig.params.x || 0, width));
    const cropY = Math.max(0, Math.min(cropConfig.params.y || 0, height));
    const cropWidth = Math.min(
      cropConfig.params.width || width,
      width - cropX,
    );
    const cropHeight = Math.min(
      cropConfig.params.height || height,
      height - cropY,
    );

    console.log("[PixiJS] Applying crop:", {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      originalWidth: width,
      originalHeight: height,
    });

    // Create a cropped texture using a frame Rectangle
    const cropFrame = new Rectangle(cropX, cropY, cropWidth, cropHeight);
    texture = new Texture({
      source: texture.source,
      frame: cropFrame,
    });

    // Update dimensions to cropped size
    width = cropWidth;
    height = cropHeight;
  }

  // Resize app to match final dimensions
  app.renderer.resize(width, height);

  // 5. Clear the stage from previous renders
  app.stage.removeChildren();

  // 6. Create sprite from (possibly cropped) texture
  const sprite = new Sprite(texture);
  sprite.width = width;
  sprite.height = height;

  // 7. Apply remaining filters to sprite
  if (otherFilters.length > 0) {
    const filters = otherFilters.map((config) =>
      createFilterFromConfig(config),
    );
    sprite.filters = filters; // PixiJS applies all filters on GPU
  }

  // 8. Add to stage and render
  app.stage.addChild(sprite);
  app.renderer.render(app.stage);

  // 9. Extract as base64 using PixiJS extract API (Layer 3 logic)
  // Using renderer.extract is more reliable than canvas.toDataURL for WebGL
  let dataURL: string;

  try {
    // PixiJS extract API handles WebGL readback properly
    // In Pixi v8, base64() takes only the target parameter (format is PNG by default)
    dataURL = await app.renderer.extract.base64(app.stage);
    console.log("[PixiJS] Successfully extracted rendered image");
  } catch (extractError) {
    // Handle CORS/SecurityError specifically
    if (
      extractError instanceof DOMException &&
      extractError.name === "SecurityError"
    ) {
      throw new Error(
        "Canvas extraction blocked by CORS policy. " +
          "The image server must send Access-Control-Allow-Origin header, " +
          "or use a proxied/local image. Error: " +
          extractError.message,
      );
    }

    // Re-throw other errors
    throw new Error(
      `Failed to extract canvas: ${extractError instanceof Error ? extractError.message : "Unknown error"}`,
    );
  }

  // 10. Cleanup resources (keep the app/context alive)
  // Destroy filters explicitly to free GPU resources (shaders, uniforms, buffers)
  if (sprite.filters && Array.isArray(sprite.filters)) {
    sprite.filters.forEach((filter) => {
      if (filter && typeof filter.destroy === "function") {
        try {
          filter.destroy();
        } catch (error) {
          console.warn("Failed to destroy filter:", error);
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
  filterConfigs: FilterConfig[],
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
 * Blend mode mapping from user-friendly names to PixiJS v8 blend mode strings
 * In Pixi v8, blendMode accepts string values directly
 */
const BLEND_MODE_MAP: Record<string, string> = {
  normal: "normal",
  multiply: "multiply",
  screen: "screen",
  add: "add",
  overlay: "overlay", // Pixi v8 supports overlay
  darken: "darken",   // Pixi v8 supports darken
  lighten: "lighten", // Pixi v8 supports lighten
};

/**
 * Internal function that performs the actual composite rendering.
 * Should only be called through the render queue to prevent concurrent access.
 */
async function performComposite(
  imageSources: string[],
  blendMode: string,
  opacity: number,
  filterConfigs: FilterConfig[],
): Promise<string> {
  console.log("[performComposite] Starting composite:", {
    imageCount: imageSources.length,
    blendMode,
    opacity,
    filterCount: filterConfigs.length,
  });

  // Validate inputs
  if (!imageSources || imageSources.length < 2) {
    throw new Error("Composite requires at least 2 images");
  }

  // 1. Get shared PixiJS application (reuses WebGL context)
  let app;
  try {
    app = await getSharedApp();
    console.log("[performComposite] Pixi app obtained successfully");
  } catch (error) {
    console.error("[performComposite] Failed to get Pixi app:", error);
    throw error;
  }

  // Check for WebGL context loss before attempting render
  if ((app.renderer as any).gl?.isContextLost?.()) {
    disposeSharedPixiApp();
    throw new Error(
      "WebGL context was lost (GPU reset or too many contexts). " +
        "The app will automatically recover on the next render attempt. " +
        "If this persists, try refreshing the page.",
    );
  }

  // 2. Load all images into HTMLImageElements
  const images: HTMLImageElement[] = [];
  console.log("[performComposite] Loading images");

  for (let i = 0; i < imageSources.length; i++) {
    const imageSource = imageSources[i];
    const img = new Image();

    // Set crossOrigin for remote URLs
    if (!imageSource.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }

    try {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      await Promise.race([
        new Promise<void>((resolve, reject) => {
          img.onload = () => {
            if (timeoutId !== null) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            resolve();
          };
          img.onerror = (e) => {
            if (timeoutId !== null) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            reject(new Error(`Failed to load image ${i + 1}`));
          };
          img.src = imageSource;
        }),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Image ${i + 1} load timeout (10s)`));
          }, 10000);
        }),
      ]);

      images.push(img);
      console.log(`[performComposite] Image ${i + 1}/${imageSources.length} loaded`);
    } catch (error) {
      console.error(`[performComposite] Failed to load image ${i + 1}:`, error);
      throw error;
    }
  }

  // 3. Determine canvas size based on first image
  const MAX_DIMENSION = 4096;
  let width = images[0].width || 1024;
  let height = images[0].height || 1024;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
    console.warn(
      `[performComposite] Canvas dimensions exceed ${MAX_DIMENSION}px, scaling down to ${width}x${height}`,
    );
  }

  // Resize app to match dimensions
  app.renderer.resize(width, height);

  // 4. Clear the stage from previous renders
  app.stage.removeChildren();

  // 5. Create sprites for each image and layer them with blend modes
  const sprites: Sprite[] = [];
  const blendModeValue = BLEND_MODE_MAP[blendMode] || "normal";

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const texture = Texture.from(img);

    if (!texture || !texture.source) {
      throw new Error(`Failed to create texture from image ${i + 1}`);
    }

    const sprite = new Sprite(texture);
    sprite.width = width;
    sprite.height = height;

    // First image (base layer) uses normal blend mode and full opacity
    // Subsequent images use the selected blend mode and opacity
    if (i === 0) {
      sprite.blendMode = "normal";
      sprite.alpha = 1.0;
    } else {
      sprite.blendMode = blendModeValue as any; // Cast to any for type compatibility
      sprite.alpha = opacity;
    }

    sprites.push(sprite);
    app.stage.addChild(sprite);
    console.log(`[performComposite] Sprite ${i + 1} added with blendMode=${sprite.blendMode}, alpha=${sprite.alpha}`);
  }

  // 6. Apply filters to the entire composite if provided
  if (filterConfigs.length > 0) {
    const filters = filterConfigs.map((config) => createFilterFromConfig(config));
    app.stage.filters = filters;
    console.log(`[performComposite] Applied ${filters.length} filters to composite`);
  }

  // 7. Render the composite
  app.renderer.render(app.stage);

  // 8. Extract as base64
  let dataURL: string;

  try {
    dataURL = await app.renderer.extract.base64(app.stage);
    console.log("[performComposite] Successfully extracted composite image");
  } catch (extractError) {
    if (
      extractError instanceof DOMException &&
      extractError.name === "SecurityError"
    ) {
      throw new Error(
        "Canvas extraction blocked by CORS policy. " +
          "The image server must send Access-Control-Allow-Origin header, " +
          "or use a proxied/local image. Error: " +
          extractError.message,
      );
    }

    throw new Error(
      `Failed to extract canvas: ${extractError instanceof Error ? extractError.message : "Unknown error"}`,
    );
  }

  // 9. Cleanup resources
  if (app.stage.filters && Array.isArray(app.stage.filters)) {
    app.stage.filters.forEach((filter) => {
      if (filter && typeof filter.destroy === "function") {
        try {
          filter.destroy();
        } catch (error) {
          console.warn("Failed to destroy filter:", error);
        }
      }
    });
    app.stage.filters = null;
  }

  sprites.forEach((sprite) => {
    sprite.destroy({ children: true, texture: false });
  });

  images.forEach((img, i) => {
    const texture = Texture.from(img);
    if (texture) {
      texture.destroy(true);
    }
  });

  return dataURL;
}

/**
 * Renders a composite of multiple images with PixiJS (PUBLIC API).
 * Uses a queue to serialize renders and prevent concurrent access to shared app.
 *
 * @param imageSources - Array of base64 data URIs or URLs (minimum 2)
 * @param blendMode - Blend mode to apply (normal, multiply, screen, add, etc.)
 * @param opacity - Opacity for layers 2+ (0.0 to 1.0)
 * @param filterConfigs - Optional array of filter configs to apply to final composite
 * @returns Promise<string> - Base64 data URI of composited result
 */
export async function renderCompositeWithPixi(
  imageSources: string[],
  blendMode: string = "normal",
  opacity: number = 1.0,
  filterConfigs: FilterConfig[] = [],
): Promise<string> {
  // Enqueue this render to prevent concurrent modification of shared app
  return new Promise<string>((resolve, reject) => {
    renderQueue = renderQueue
      .then(() => performComposite(imageSources, blendMode, opacity, filterConfigs))
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Utility to check if PixiJS/WebGL is supported
 */
export function isPixiSupported(): boolean {
  try {
    const testCanvas = document.createElement("canvas");
    const gl =
      testCanvas.getContext("webgl") || testCanvas.getContext("webgl2");
    return !!gl;
  } catch {
    return false;
  }
}
