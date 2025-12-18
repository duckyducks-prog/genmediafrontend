import { Node, Edge } from "reactflow";
import { FilterConfig } from "@/lib/pixi-filter-configs";

// ============================================================================
// NODE TYPES
// ============================================================================

export enum NodeType {
  // INPUT nodes (no input connectors, only outputs)
  ImageInput = "imageInput",
  Prompt = "prompt",

  // MODIFIER nodes (both input and output connectors)
  PromptConcatenator = "promptConcatenator",
  TextIterator = "textIterator",

  // IMAGE MODIFIER nodes (PixiJS filters)
  BrightnessContrast = "brightnessContrast",
  Blur = "blur",
  Sharpen = "sharpen",
  HueSaturation = "hueSaturation",
  Noise = "noise",
  Vignette = "vignette",
  Crop = "crop",
  ImageComposite = "imageComposite",

  // VIDEO MODIFIER nodes
  ExtractLastFrame = "extractLastFrame",

  // ACTION nodes (inputs and outputs)
  GenerateVideo = "generateVideo",
  GenerateImage = "generateImage",
  LLM = "llm",

  // ACTION/OUTPUT nodes
  Preview = "preview",
  Download = "download",

  // Legacy/utility nodes
  ImageOutput = "imageOutput",
  VideoOutput = "videoOutput",
}

// Re-export FilterConfig for convenience
export type { FilterConfig };

// ============================================================================
// CONNECTOR DATA TYPES
// ============================================================================

export enum ConnectorType {
  Text = "text", // String data (prompts, responses)
  Image = "image", // Single base64 image
  Images = "images", // Array of base64 images
  Video = "video", // Base64 video
  Any = "any", // Pass-through for any data
}

// ============================================================================
// CONNECTOR DEFINITIONS
// ============================================================================

export interface InputConnector {
  id: string;
  label: string;
  type: ConnectorType;
  required: boolean;
  acceptsMultiple: boolean; // For reference_images that can accept multiple connections
}

export interface OutputConnector {
  id: string;
  label: string;
  type: ConnectorType;
}

// ============================================================================
// NODE DATA INTERFACES
// ============================================================================

// Base interface for all nodes
export interface BaseNodeData {
  label: string;
  status?: "ready" | "executing" | "completed" | "error";
  error?: string;
  outputs?: Record<string, any>; // Store output values from execution
  readOnly?: boolean; // Indicates if node is in read-only mode (for templates)
  locked?: boolean; // Indicates if node position is locked (prevents accidental dragging)
}

// IMAGE INPUT node
export interface ImageInputNodeData extends BaseNodeData {
  // Asset reference pattern (Firestore migration)
  imageRef?: string; // Asset ID reference (stored in Firestore)
  imageUrl?: string | null; // Resolved URL (computed by backend)
  imageRefExists?: boolean; // Asset existence flag
  file?: File | null; // For new uploads (not persisted)
}

// PROMPT node
export interface PromptNodeData extends BaseNodeData {
  prompt: string;
}

// PROMPT CONCATENATOR node
export interface PromptConcatenatorNodeData extends BaseNodeData {
  separator: "Space" | "Comma" | "Newline" | "Period";
  combinedPreview?: string; // Shows preview of combined text
}

// TEXT ITERATOR node
export interface TextIteratorNodeData extends BaseNodeData {
  fixedSection: string; // Fixed text applied to all outputs
  variableItems: string[]; // Array of variable texts (dialogue lines)
  batchInput: string; // Text area input for pasting multiple lines
  separator: "Newline" | "Custom"; // How to split batch input
  customSeparator?: string; // Custom separator if selected
  itemPreviews?: string[]; // Preview of combined prompts
  dynamicOutputCount: number; // Number of output handles to render
}

// GENERATE VIDEO node
export interface GenerateVideoNodeData extends BaseNodeData {
  isGenerating: boolean;
  operationName?: string;
  pollAttempts?: number;

  // Asset reference pattern (Firestore migration)
  videoRef?: string; // Generated video asset ID
  videoUrl?: string; // Resolved URL (computed by backend)
  videoRefExists?: boolean; // Asset existence flag

  // Frame references for frame bridging
  firstFrameRef?: string; // First frame asset ID
  firstFrameUrl?: string; // Resolved URL (computed by backend)
  firstFrameRefExists?: boolean;

  lastFrameRef?: string; // Last frame asset ID
  lastFrameUrl?: string; // Resolved URL (computed by backend)
  lastFrameRefExists?: boolean;

  // Reference images
  referenceImageRefs?: string[]; // Reference image asset IDs
  referenceImageUrls?: string[]; // Resolved URLs (computed by backend)

  aspectRatio: "16:9" | "9:16";
  generateAudio: boolean;
  durationSeconds: 4 | 6 | 8;
  useConsistentVoice: boolean; // Enable consistent voice using seed
  seed?: number; // Seed value for consistent generation (voice/style)
}

// GENERATE IMAGE node
export interface GenerateImageNodeData extends BaseNodeData {
  isGenerating: boolean;

  // Asset reference pattern (Firestore migration)
  imageRef?: string; // Primary generated image asset ID
  imageUrl?: string; // Resolved URL (computed by backend)
  imageRefExists?: boolean; // Asset existence flag

  // Multiple generated images (for batch generation)
  imageRefs?: string[]; // Asset IDs for all generated images
  images?: string[]; // Resolved URLs or base64 (for immediate display)

  // Reference images
  referenceImageRefs?: string[]; // Reference image asset IDs
  referenceImageUrls?: string[]; // Resolved URLs (computed by backend)

  aspectRatio: "1:1" | "16:9" | "9:16" | "3:4" | "4:3";
}

// LLM node
export interface LLMNodeData extends BaseNodeData {
  systemPrompt: string;
  temperature: number; // 0.0 to 1.0
  isGenerating: boolean;
  responsePreview?: string;
}

// IMAGE MODIFIER nodes (PixiJS filters)
export interface BrightnessContrastNodeData extends BaseNodeData {
  brightness: number;
  contrast: number;
}

export interface BlurNodeData extends BaseNodeData {
  strength: number;
  quality: number;
}

export interface HueSaturationNodeData extends BaseNodeData {
  hue: number;
  saturation: number;
}

export interface NoiseNodeData extends BaseNodeData {
  noise: number;
}

export interface SharpenNodeData extends BaseNodeData {
  gamma: number;
}

export interface VignetteNodeData extends BaseNodeData {
  size: number;
  amount: number;
}

export interface CropNodeData extends BaseNodeData {
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16" | "custom";
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth?: number;
  originalHeight?: number;
}

// IMAGE COMPOSITE node
export interface ImageCompositeNodeData extends BaseNodeData {
  blendMode:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "add"
    | "darken"
    | "lighten";
  opacity: number; // 0-1 for the top layers
  compositePreview?: string; // Preview of the composited result
}

// EXTRACT LAST FRAME node
export interface ExtractLastFrameNodeData extends BaseNodeData {
  // Input video reference
  videoRef?: string; // Input video asset ID
  videoUrl?: string; // Resolved URL (computed by backend)
  videoRefExists?: boolean;

  // Extracted frame reference
  extractedFrameRef?: string; // Extracted frame asset ID
  extractedFrameUrl?: string; // Resolved URL (computed by backend)
  extractedFrameRefExists?: boolean;
}

// PREVIEW node
export interface PreviewNodeData extends BaseNodeData {
  // Asset references
  imageRef?: string;
  imageUrl?: string;
  imageRefExists?: boolean;

  videoRef?: string;
  videoUrl?: string;
  videoRefExists?: boolean;

  textContent?: string;
}

// OUTPUT nodes
export interface OutputNodeData extends BaseNodeData {
  result: string | null;
  type: "image" | "video";

  // Asset references (for persisted outputs)
  assetRef?: string; // Asset ID
  assetUrl?: string; // Resolved URL (computed by backend)
  assetRefExists?: boolean;
}

export interface DownloadNodeData extends BaseNodeData {
  inputData: string | null;
  type: "image" | "video";
}

// ============================================================================
// UNION TYPE FOR ALL NODE DATA
// ============================================================================

export type WorkflowNodeData =
  | ImageInputNodeData
  | PromptNodeData
  | PromptConcatenatorNodeData
  | TextIteratorNodeData
  | BrightnessContrastNodeData
  | BlurNodeData
  | SharpenNodeData
  | HueSaturationNodeData
  | NoiseNodeData
  | VignetteNodeData
  | CropNodeData
  | ImageCompositeNodeData
  | ExtractLastFrameNodeData
  | GenerateVideoNodeData
  | GenerateImageNodeData
  | LLMNodeData
  | PreviewNodeData
  | OutputNodeData
  | DownloadNodeData;

// ============================================================================
// CUSTOM NODE & EDGE TYPES
// ============================================================================

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

// ============================================================================
// NODE CONFIGURATIONS (defines connectors for each node type)
// ============================================================================

export interface NodeConfiguration {
  type: NodeType;
  label: string;
  category: "input" | "modifier" | "action" | "output";
  description: string;
  inputConnectors: InputConnector[];
  outputConnectors: OutputConnector[];
}

export const NODE_CONFIGURATIONS: Record<NodeType, NodeConfiguration> = {
  // ========== INPUT NODES ==========
  [NodeType.ImageInput]: {
    type: NodeType.ImageInput,
    label: "Image Input",
    category: "input",
    description: "Upload or load an image",
    inputConnectors: [],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
    ],
  },

  [NodeType.Prompt]: {
    type: NodeType.Prompt,
    label: "Prompt",
    category: "input",
    description: "Text input for AI generation",
    inputConnectors: [],
    outputConnectors: [
      {
        id: "text",
        label: "Text",
        type: ConnectorType.Text,
      },
    ],
  },

  // ========== MODIFIER NODES ==========
  [NodeType.PromptConcatenator]: {
    type: NodeType.PromptConcatenator,
    label: "Prompt Concatenator",
    category: "modifier",
    description: "Combine multiple prompts into one",
    inputConnectors: [
      {
        id: "prompt_1",
        label: "Prompt 1",
        type: ConnectorType.Text,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "prompt_2",
        label: "Prompt 2",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "prompt_3",
        label: "Prompt 3",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "prompt_4",
        label: "Prompt 4",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "combined",
        label: "Combined",
        type: ConnectorType.Text,
      },
    ],
  },

  [NodeType.TextIterator]: {
    type: NodeType.TextIterator,
    label: "Text Iterator",
    category: "modifier",
    description: "Combine fixed prompt with multiple variable texts",
    inputConnectors: [
      {
        id: "fixed_section",
        label: "Fixed Section",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "variable_items",
        label: "Variable Items",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: true, // Can accept multiple Prompt nodes
      },
    ],
    outputConnectors: [
      // Dynamic outputs will be created at runtime
      // Format: output_0, output_1, output_2, etc.
    ],
  },

  // ========== IMAGE MODIFIER NODES (PixiJS filters) ==========
  [NodeType.BrightnessContrast]: {
    type: NodeType.BrightnessContrast,
    label: "Brightness/Contrast",
    category: "modifier",
    description: "Adjust brightness and contrast",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any, // Array of FilterConfig
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image, // Pass-through original
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any, // Updated filter config array
      },
    ],
  },

  [NodeType.Blur]: {
    type: NodeType.Blur,
    label: "Blur",
    category: "modifier",
    description: "Apply Gaussian blur",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
      },
    ],
  },

  [NodeType.Sharpen]: {
    type: NodeType.Sharpen,
    label: "Sharpen",
    category: "modifier",
    description: "Sharpen image details",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
      },
    ],
  },

  [NodeType.HueSaturation]: {
    type: NodeType.HueSaturation,
    label: "Hue/Saturation",
    category: "modifier",
    description: "Adjust hue and saturation",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
      },
    ],
  },

  [NodeType.Noise]: {
    type: NodeType.Noise,
    label: "Noise",
    category: "modifier",
    description: "Add grain/noise texture",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
      },
    ],
  },

  [NodeType.Vignette]: {
    type: NodeType.Vignette,
    label: "Vignette",
    category: "modifier",
    description: "Add vignette effect",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
      },
    ],
  },

  [NodeType.Crop]: {
    type: NodeType.Crop,
    label: "Crop",
    category: "modifier",
    description: "Crop image to aspect ratio",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
      },
    ],
  },

  [NodeType.ImageComposite]: {
    type: NodeType.ImageComposite,
    label: "Image Composite",
    category: "modifier",
    description: "Blend multiple images together",
    inputConnectors: [
      {
        id: "images",
        label: "Images",
        type: ConnectorType.Images,
        required: true,
        acceptsMultiple: true,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Composite Image",
        type: ConnectorType.Image,
      },
    ],
  },

  [NodeType.ExtractLastFrame]: {
    type: NodeType.ExtractLastFrame,
    label: "Extract Last Frame",
    category: "modifier",
    description: "Extract the last frame from a video",
    inputConnectors: [
      {
        id: "video",
        label: "Video",
        type: ConnectorType.Video,
        required: true,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Last Frame",
        type: ConnectorType.Image,
      },
    ],
  },

  // ========== ACTION NODES ==========
  [NodeType.GenerateVideo]: {
    type: NodeType.GenerateVideo,
    label: "Generate Video",
    category: "action",
    description: "Generate video using Veo 3.1",
    inputConnectors: [
      {
        id: "prompt",
        label: "Prompt",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "first_frame",
        label: "First Frame",
        type: ConnectorType.Image,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "last_frame",
        label: "Last Frame",
        type: ConnectorType.Image,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "reference_images",
        label: "Reference Images",
        type: ConnectorType.Images,
        required: false,
        acceptsMultiple: true, // Can accept multiple Image Input connections
      },
    ],
    outputConnectors: [
      {
        id: "video",
        label: "Video",
        type: ConnectorType.Video,
      },
    ],
  },

  [NodeType.GenerateImage]: {
    type: NodeType.GenerateImage,
    label: "Generate Image",
    category: "action",
    description:
      "Generate or edit images using Gemini (supports reference images with newer models)",
    inputConnectors: [
      {
        id: "prompt",
        label: "Prompt",
        type: ConnectorType.Text,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "reference_images",
        label: "Reference Images",
        type: ConnectorType.Images,
        required: false,
        acceptsMultiple: true,
      },
    ],
    outputConnectors: [
      {
        id: "images",
        label: "Images",
        type: ConnectorType.Images,
      },
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
    ],
  },

  [NodeType.LLM]: {
    type: NodeType.LLM,
    label: "LLM",
    category: "action",
    description: "Text generation and prompt enhancement",
    inputConnectors: [
      {
        id: "prompt",
        label: "Prompt",
        type: ConnectorType.Text,
        required: true,
        acceptsMultiple: false,
      },
      {
        id: "context",
        label: "Context",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "response",
        label: "Response",
        type: ConnectorType.Text,
      },
    ],
  },

  [NodeType.Preview]: {
    type: NodeType.Preview,
    label: "Preview",
    category: "action",
    description: "Preview images, videos, or text",
    inputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any, // Array of FilterConfig
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "video",
        label: "Video",
        type: ConnectorType.Video,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "text",
        label: "Text",
        type: ConnectorType.Text,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "image",
        label: "Image",
        type: ConnectorType.Image,
      },
    ],
  },

  [NodeType.Download]: {
    type: NodeType.Download,
    label: "Download",
    category: "action",
    description: "Download media result",
    inputConnectors: [
      {
        id: "media-input",
        label: "Media",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [],
  },

  // ========== OUTPUT/UTILITY NODES ==========
  [NodeType.ImageOutput]: {
    type: NodeType.ImageOutput,
    label: "Image Output",
    category: "output",
    description: "Display generated image",
    inputConnectors: [
      {
        id: "image-input",
        label: "Image",
        type: ConnectorType.Image,
        required: false,
        acceptsMultiple: false,
      },
      {
        id: "filters",
        label: "Filters",
        type: ConnectorType.Any, // Array of FilterConfig
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [],
  },

  [NodeType.VideoOutput]: {
    type: NodeType.VideoOutput,
    label: "Video Output",
    category: "output",
    description: "Display generated video",
    inputConnectors: [
      {
        id: "video-input",
        label: "Video",
        type: ConnectorType.Video,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getNodeConfiguration(nodeType: NodeType): NodeConfiguration {
  return NODE_CONFIGURATIONS[nodeType];
}

export function canConnect(
  sourceType: ConnectorType,
  targetType: ConnectorType,
): boolean {
  // Any can connect to anything
  if (sourceType === ConnectorType.Any || targetType === ConnectorType.Any) {
    return true;
  }

  // Image can connect to Images (array)
  if (
    sourceType === ConnectorType.Image &&
    targetType === ConnectorType.Images
  ) {
    return true;
  }

  // Same types can connect
  return sourceType === targetType;
}

export function validateMutualExclusion(
  nodeType: NodeType,
  connections: Record<string, any>,
): { valid: boolean; error?: string } {
  if (nodeType === NodeType.GenerateVideo) {
    const hasFrames = connections.first_frame || connections.last_frame;
    const hasReferences =
      connections.reference_images && connections.reference_images.length > 0;

    if (hasFrames && hasReferences) {
      return {
        valid: false,
        error:
          "Cannot use both frame bridging (first/last frame) and reference images. Disconnect one.",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// WORKFLOW EXECUTION
// ============================================================================

export interface WorkflowExecutionState {
  isExecuting: boolean;
  currentNodeId: string | null;
  executedNodes: Set<string>;
  errors: Map<string, string>;
}

export interface NodePaletteItem {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  category: "input" | "modifier" | "action" | "output";
  description: string;
}
