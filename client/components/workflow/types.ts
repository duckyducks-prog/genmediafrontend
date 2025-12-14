import { Node, Edge } from "reactflow";

// ============================================================================
// NODE TYPES
// ============================================================================

export enum NodeType {
  // INPUT nodes (no input connectors, only outputs)
  ImageInput = "imageInput",
  Prompt = "prompt",

  // MODIFIER nodes (both input and output connectors)
  PromptConcatenator = "promptConcatenator",
  Format = "format",

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

// ============================================================================
// CONNECTOR DATA TYPES
// ============================================================================

export enum ConnectorType {
  Text = "text",           // String data (prompts, responses)
  Image = "image",         // Single base64 image
  Images = "images",       // Array of base64 images
  Video = "video",         // Base64 video
  Format = "format",       // Format configuration object
  Any = "any",            // Pass-through for any data
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
}

// IMAGE INPUT node
export interface ImageInputNodeData extends BaseNodeData {
  imageUrl: string | null;
  file: File | null;
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

// FORMAT node
export interface FormatNodeData extends BaseNodeData {
  aspectRatio: "16:9" | "9:16" | "1:1";
  durationSeconds: 5 | 6 | 7 | 8;
  generateAudio: boolean;
  resolution: "1080p" | "720p";
}

// GENERATE VIDEO node
export interface GenerateVideoNodeData extends BaseNodeData {
  isGenerating: boolean;
  operationName?: string;
  pollAttempts?: number;
  videoUrl?: string;
}

// GENERATE IMAGE node
export interface GenerateImageNodeData extends BaseNodeData {
  isGenerating: boolean;
  imageUrl?: string;
  images?: string[];
}

// LLM node
export interface LLMNodeData extends BaseNodeData {
  systemPrompt: string;
  temperature: number; // 0.0 to 1.0
  isGenerating: boolean;
  responsePreview?: string;
}

// PREVIEW node
export interface PreviewNodeData extends BaseNodeData {
  imageUrl?: string;
  videoUrl?: string;
  textContent?: string;
}

// OUTPUT nodes
export interface OutputNodeData extends BaseNodeData {
  result: string | null;
  type: "image" | "video";
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
  | FormatNodeData
  | GenerateVideoNodeData
  | GenerateImageNodeData
  | LLMNodeData
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

  [NodeType.Format]: {
    type: NodeType.Format,
    label: "Format",
    category: "modifier",
    description: "Configure generation settings",
    inputConnectors: [
      {
        id: "input",
        label: "Pass-through",
        type: ConnectorType.Any,
        required: false,
        acceptsMultiple: false,
      },
    ],
    outputConnectors: [
      {
        id: "format",
        label: "Format",
        type: ConnectorType.Format,
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
        required: true,
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
      {
        id: "format",
        label: "Format",
        type: ConnectorType.Format,
        required: false,
        acceptsMultiple: false,
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
    description: "Generate or edit images using Gemini 3 Pro",
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
      {
        id: "format",
        label: "Format",
        type: ConnectorType.Format,
        required: false,
        acceptsMultiple: false,
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

  [NodeType.Download]: {
    type: NodeType.Download,
    label: "Download",
    category: "output",
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
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getNodeConfiguration(nodeType: NodeType): NodeConfiguration {
  return NODE_CONFIGURATIONS[nodeType];
}

export function canConnect(
  sourceType: ConnectorType,
  targetType: ConnectorType
): boolean {
  // Any can connect to anything
  if (sourceType === ConnectorType.Any || targetType === ConnectorType.Any) {
    return true;
  }

  // Image can connect to Images (array)
  if (sourceType === ConnectorType.Image && targetType === ConnectorType.Images) {
    return true;
  }

  // Same types can connect
  return sourceType === targetType;
}

export function validateMutualExclusion(
  nodeType: NodeType,
  connections: Record<string, any>
): { valid: boolean; error?: string } {
  if (nodeType === NodeType.GenerateVideo) {
    const hasFrames = connections.first_frame || connections.last_frame;
    const hasReferences = connections.reference_images && connections.reference_images.length > 0;

    if (hasFrames && hasReferences) {
      return {
        valid: false,
        error: "Cannot use both frame bridging (first/last frame) and reference images. Disconnect one.",
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
