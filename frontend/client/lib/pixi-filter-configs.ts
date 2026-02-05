/**
 * Lightweight filter configuration (stored in nodes)
 * NO PixiJS Filter instances, just parameter data
 */
export interface FilterConfig {
  type:
    | "brightness"
    | "blur"
    | "sharpen"
    | "hueSaturation"
    | "noise"
    | "vignette"
    | "crop"
    | "filmGrain";
  params: Record<string, number>;
}

/**
 * Filter definition metadata (parameters, ranges, labels)
 */
export interface FilterDefinition {
  type: string;
  label: string;
  description: string;
  filterClass: string; // Class name from PixiJS/pixi-filters
  params: {
    [key: string]: {
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      displayMultiplier?: number; // e.g., 100 to show as percentage
    };
  };
}

export const FILTER_DEFINITIONS: Record<string, FilterDefinition> = {
  brightness: {
    type: "brightness",
    label: "Brightness/Contrast",
    description: "Adjust brightness and contrast",
    filterClass: "AdjustmentFilter", // from pixi-filters
    params: {
      brightness: {
        label: "Brightness",
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        displayMultiplier: 100,
      },
      contrast: {
        label: "Contrast",
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        displayMultiplier: 100,
      },
    },
  },

  blur: {
    type: "blur",
    label: "Blur",
    description: "Apply Gaussian blur",
    filterClass: "BlurFilter",
    params: {
      strength: {
        label: "Strength",
        min: 0,
        max: 50,
        step: 1,
        default: 8,
      },
      quality: {
        label: "Quality",
        min: 1,
        max: 10,
        step: 1,
        default: 4,
      },
    },
  },

  hueSaturation: {
    type: "hueSaturation",
    label: "Hue/Saturation",
    description: "Adjust hue and saturation",
    filterClass: "ColorMatrixFilter",
    params: {
      hue: {
        label: "Hue",
        min: 0,
        max: 360,
        step: 1,
        default: 0,
      },
      saturation: {
        label: "Saturation",
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        displayMultiplier: 100,
      },
    },
  },

  noise: {
    type: "noise",
    label: "Noise",
    description: "Add grain/noise texture",
    filterClass: "NoiseFilter",
    params: {
      noise: {
        label: "Amount",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        displayMultiplier: 100,
      },
    },
  },

  sharpen: {
    type: "sharpen",
    label: "Sharpen",
    description: "Sharpen image details",
    filterClass: "AdjustmentFilter",
    params: {
      gamma: {
        label: "Intensity",
        min: 0,
        max: 3,
        step: 0.1,
        default: 1.0,
      },
    },
  },

  vignette: {
    type: "vignette",
    label: "Vignette",
    description: "Add vignette effect",
    filterClass: "Custom", // Will need custom implementation
    params: {
      size: {
        label: "Size",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        displayMultiplier: 100,
      },
      amount: {
        label: "Amount",
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        displayMultiplier: 100,
      },
    },
  },

  crop: {
    type: "crop",
    label: "Crop",
    description: "Crop image to specific dimensions and position",
    filterClass: "Custom", // Custom crop implementation
    params: {
      x: {
        label: "X Position",
        min: 0,
        max: 4096,
        step: 1,
        default: 0,
      },
      y: {
        label: "Y Position",
        min: 0,
        max: 4096,
        step: 1,
        default: 0,
      },
      width: {
        label: "Width",
        min: 1,
        max: 4096,
        step: 1,
        default: 1024,
      },
      height: {
        label: "Height",
        min: 1,
        max: 4096,
        step: 1,
        default: 1024,
      },
    },
  },

  filmGrain: {
    type: "filmGrain",
    label: "Film Grain",
    description: "Add realistic film grain effect",
    filterClass: "FilmGrainFilter", // Custom shader filter
    params: {
      intensity: {
        label: "Intensity",
        min: 0,
        max: 100,
        step: 1,
        default: 50,
      },
      size: {
        label: "Size",
        min: 1,
        max: 4,
        step: 1,
        default: 1,
      },
      shadows: {
        label: "Shadows",
        min: 0,
        max: 100,
        step: 1,
        default: 30,
      },
      highlights: {
        label: "Highlights",
        min: 0,
        max: 100,
        step: 1,
        default: 30,
      },
      midtonesBias: {
        label: "Midtones",
        min: 0,
        max: 100,
        step: 1,
        default: 80,
      },
    },
  },
};
