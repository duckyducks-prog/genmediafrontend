import { SavedWorkflow } from "./workflow-api";
import { NodeType } from "@/components/workflow/types";

/**
 * Mock workflow templates for testing the workflow gallery
 * These will be shown in the "Workflow Templates" tab until backend is ready
 */
export const MOCK_WORKFLOW_TEMPLATES: SavedWorkflow[] = [
  {
    id: "template_camera_angles",
    name: "Camera Angles",
    description: "A workflow template demonstrating different camera angle techniques for video production",
    is_public: true,
    background_image: "https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2Ff1205ea241814241af2b6084f80acbc7?format=webp&width=800",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: [
      {
        id: "prompt-1",
        type: NodeType.Prompt,
        position: { x: 100, y: 200 },
        data: {
          label: "Camera Prompt",
          prompt: "A cinematic shot with dramatic lighting",
          status: "ready",
        },
      },
      {
        id: "generate-1",
        type: NodeType.GenerateImage,
        position: { x: 400, y: 200 },
        data: {
          label: "Generate Image",
          aspectRatio: "16:9",
          status: "ready",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "prompt-1",
        target: "generate-1",
        sourceHandle: "text",
        targetHandle: "prompt",
      },
    ],
  },
];
