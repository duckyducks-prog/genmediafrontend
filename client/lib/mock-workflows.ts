import { SavedWorkflow } from "./workflow-api";
import { NodeType } from "@/components/workflow/types";

/**
 * Mock workflow templates for testing the workflow gallery
 * These will be shown in the "Workflow Templates" tab until backend is ready
 */
export const MOCK_WORKFLOW_TEMPLATES: SavedWorkflow[] = [
  {
    id: "template-1",
    name: "Image Enhancement Pipeline",
    description:
      "Apply professional image enhancements with adjustable filters for brightness, contrast, and sharpening",
    is_public: true,
    user_email: "templates@hubspot.com",
    created_at: new Date("2024-01-15").toISOString(),
    nodes: [
      {
        id: "image-input-1",
        type: NodeType.ImageInput,
        position: { x: 100, y: 200 },
        data: {
          imageUrl: null,
          file: null,
          label: "Image Input",
          outputs: {},
        },
      },
      {
        id: "brightness-1",
        type: NodeType.BrightnessContrast,
        position: { x: 350, y: 150 },
        data: {
          brightness: 0.1,
          contrast: 0.1,
          label: "Brightness/Contrast",
          outputs: {},
        },
      },
      {
        id: "sharpen-1",
        type: NodeType.Sharpen,
        position: { x: 350, y: 300 },
        data: {
          gamma: 1.2,
          label: "Sharpen",
          outputs: {},
        },
      },
      {
        id: "preview-1",
        type: NodeType.Preview,
        position: { x: 600, y: 200 },
        data: {
          label: "Preview Result",
        },
      },
    ],
    edges: [
      {
        id: "e1-2",
        source: "image-input-1",
        target: "brightness-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
      {
        id: "e2-3",
        source: "brightness-1",
        target: "sharpen-1",
        sourceHandle: "filters",
        targetHandle: "filters",
      },
      {
        id: "e1-3",
        source: "image-input-1",
        target: "sharpen-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
      {
        id: "e3-4",
        source: "sharpen-1",
        target: "preview-1",
        sourceHandle: "filters",
        targetHandle: "filters",
      },
      {
        id: "e1-4",
        source: "image-input-1",
        target: "preview-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
    ],
  },
  {
    id: "template-2",
    name: "AI Image Generation",
    description:
      "Generate AI images from text prompts with customizable format settings",
    is_public: true,
    user_email: "templates@hubspot.com",
    created_at: new Date("2024-01-20").toISOString(),
    nodes: [
      {
        id: "prompt-1",
        type: NodeType.Prompt,
        position: { x: 100, y: 200 },
        data: {
          prompt: "",
          label: "Prompt",
          outputs: {},
        },
      },
      {
        id: "format-1",
        type: NodeType.Format,
        position: { x: 100, y: 350 },
        data: {
          aspectRatio: "1:1",
          durationSeconds: 8,
          generateAudio: true,
          resolution: "1080p",
          label: "Format Settings",
          outputs: {},
        },
      },
      {
        id: "generate-1",
        type: NodeType.GenerateImage,
        position: { x: 400, y: 250 },
        data: {
          isGenerating: false,
          label: "Generate Image",
          outputs: {},
        },
      },
      {
        id: "preview-1",
        type: NodeType.Preview,
        position: { x: 700, y: 250 },
        data: {
          label: "Preview",
        },
      },
    ],
    edges: [
      {
        id: "e1-3",
        source: "prompt-1",
        target: "generate-1",
        sourceHandle: "text",
        targetHandle: "prompt",
      },
      {
        id: "e2-3",
        source: "format-1",
        target: "generate-1",
        sourceHandle: "format",
        targetHandle: "format",
      },
      {
        id: "e3-4",
        source: "generate-1",
        target: "preview-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
    ],
  },
  {
    id: "template-3",
    name: "Creative Filter Chain",
    description:
      "Experiment with multiple artistic filters including blur, vignette, and hue/saturation adjustments",
    is_public: true,
    user_email: "templates@hubspot.com",
    created_at: new Date("2024-01-25").toISOString(),
    nodes: [
      {
        id: "image-input-1",
        type: NodeType.ImageInput,
        position: { x: 50, y: 250 },
        data: {
          imageUrl: null,
          file: null,
          label: "Image Input",
          outputs: {},
        },
      },
      {
        id: "hue-1",
        type: NodeType.HueSaturation,
        position: { x: 250, y: 150 },
        data: {
          hue: 0,
          saturation: 0,
          label: "Hue/Saturation",
          outputs: {},
        },
      },
      {
        id: "vignette-1",
        type: NodeType.Vignette,
        position: { x: 250, y: 300 },
        data: {
          size: 0.5,
          amount: 0.5,
          label: "Vignette",
          outputs: {},
        },
      },
      {
        id: "blur-1",
        type: NodeType.Blur,
        position: { x: 450, y: 225 },
        data: {
          strength: 4,
          quality: 4,
          label: "Blur",
          outputs: {},
        },
      },
      {
        id: "preview-1",
        type: NodeType.Preview,
        position: { x: 650, y: 250 },
        data: {
          label: "Final Preview",
        },
      },
    ],
    edges: [
      {
        id: "e1-2",
        source: "image-input-1",
        target: "hue-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
      {
        id: "e2-3",
        source: "hue-1",
        target: "vignette-1",
        sourceHandle: "filters",
        targetHandle: "filters",
      },
      {
        id: "e1-3",
        source: "image-input-1",
        target: "vignette-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
      {
        id: "e3-4",
        source: "vignette-1",
        target: "blur-1",
        sourceHandle: "filters",
        targetHandle: "filters",
      },
      {
        id: "e1-4",
        source: "image-input-1",
        target: "blur-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
      {
        id: "e4-5",
        source: "blur-1",
        target: "preview-1",
        sourceHandle: "filters",
        targetHandle: "filters",
      },
      {
        id: "e1-5",
        source: "image-input-1",
        target: "preview-1",
        sourceHandle: "image",
        targetHandle: "image",
      },
    ],
  },
  {
    id: "template-4",
    name: "Video Generation Workflow",
    description:
      "Generate AI videos from text prompts with format configuration",
    is_public: true,
    user_email: "templates@hubspot.com",
    created_at: new Date("2024-02-01").toISOString(),
    nodes: [
      {
        id: "prompt-1",
        type: NodeType.Prompt,
        position: { x: 100, y: 200 },
        data: {
          prompt: "",
          label: "Video Prompt",
          outputs: {},
        },
      },
      {
        id: "format-1",
        type: NodeType.Format,
        position: { x: 100, y: 350 },
        data: {
          aspectRatio: "16:9",
          durationSeconds: 8,
          generateAudio: true,
          resolution: "1080p",
          label: "Video Settings",
          outputs: {},
        },
      },
      {
        id: "generate-1",
        type: NodeType.GenerateVideo,
        position: { x: 400, y: 275 },
        data: {
          isGenerating: false,
          label: "Generate Video",
          outputs: {},
        },
      },
      {
        id: "preview-1",
        type: NodeType.Preview,
        position: { x: 700, y: 275 },
        data: {
          label: "Video Preview",
        },
      },
    ],
    edges: [
      {
        id: "e1-3",
        source: "prompt-1",
        target: "generate-1",
        sourceHandle: "text",
        targetHandle: "prompt",
      },
      {
        id: "e2-3",
        source: "format-1",
        target: "generate-1",
        sourceHandle: "format",
        targetHandle: "format",
      },
      {
        id: "e3-4",
        source: "generate-1",
        target: "preview-1",
        sourceHandle: "video",
        targetHandle: "video",
      },
    ],
  },
];
