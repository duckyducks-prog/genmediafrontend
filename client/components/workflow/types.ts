import { Node, Edge } from "reactflow";

// Node Types Enum
export enum NodeType {
  PromptInput = "promptInput",
  ImageUpload = "imageUpload",
  FirstFrame = "firstFrame",
  LastFrame = "lastFrame",
  GenerateImage = "generateImage",
  GenerateVideo = "generateVideo",
  ImageOutput = "imageOutput",
  VideoOutput = "videoOutput",
  Download = "download",
}

// Data type for different handle types
export enum HandleDataType {
  Text = "text",
  Image = "image",
  Video = "video",
}

// Node Data Interfaces
export interface PromptInputNodeData {
  prompt: string;
  label: string;
}

export interface ImageUploadNodeData {
  imageUrl: string | null;
  file: File | null;
  label: string;
}

export interface GenerateImageNodeData {
  isGenerating: boolean;
  status: string;
  error?: string;
  promptInput?: string;
  referenceImageInput?: string | null;
}

export interface GenerateVideoNodeData {
  isGenerating: boolean;
  status: string;
  error?: string;
  promptInput?: string;
  firstFrameInput?: string | null;
  lastFrameInput?: string | null;
}

export interface OutputNodeData {
  result: string | null;
  type: "image" | "video";
  label: string;
}

export interface DownloadNodeData {
  inputData: string | null;
  type: "image" | "video";
  label: string;
}

// Union type for all node data
export type WorkflowNodeData =
  | PromptInputNodeData
  | ImageUploadNodeData
  | GenerateImageNodeData
  | GenerateVideoNodeData
  | OutputNodeData
  | DownloadNodeData;

// Custom Node type
export type WorkflowNode = Node<WorkflowNodeData>;

// Custom Edge type
export type WorkflowEdge = Edge;

// Workflow execution state
export interface WorkflowExecutionState {
  isExecuting: boolean;
  currentNodeId: string | null;
  executedNodes: Set<string>;
  errors: Map<string, string>;
}

// Node palette item
export interface NodePaletteItem {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  category: "input" | "action" | "output";
  description: string;
}
