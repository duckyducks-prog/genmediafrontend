/**
 * Unit tests for workflow sanitizer
 *
 * Tests that the sanitizer correctly:
 * - Strips base64 data URIs
 * - Preserves asset references (imageRef, videoRef)
 * - Preserves text content (prompts, etc.)
 */

import { describe, it, expect } from "vitest";
import { sanitizeWorkflowForSave, calculatePayloadSize, formatBytes } from "./workflow-sanitizer";
import { WorkflowNode, WorkflowEdge } from "@/components/workflow/types";

// Helper to create a mock node
function createMockNode(
  id: string,
  type: string,
  data: Record<string, any>
): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label: `Test ${type}`,
      ...data,
    },
  } as WorkflowNode;
}

// Sample base64 image data URI (small test image)
const SAMPLE_BASE64_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const SAMPLE_BASE64_VIDEO = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";

describe("workflow-sanitizer", () => {
  describe("sanitizeWorkflowForSave", () => {
    describe("preserves asset references", () => {
      it("should preserve imageRef in ImageInput nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "imageInput", {
            imageRef: "asset_12345",
            imageUrl: SAMPLE_BASE64_IMAGE, // Should be stripped
            outputs: { image: SAMPLE_BASE64_IMAGE }, // Should be stripped
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.imageRef).toBe("asset_12345");
        expect(result.nodes[0].data.imageUrl).toContain("[REMOVED_FOR_SAVE:");
        expect(result.nodes[0].data.outputs.image).toContain("[REMOVED_FOR_SAVE:");
      });

      it("should preserve videoRef in VideoInput nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "videoInput", {
            videoRef: "asset_67890",
            videoUrl: SAMPLE_BASE64_VIDEO,
            outputs: { video: SAMPLE_BASE64_VIDEO },
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.videoRef).toBe("asset_67890");
        expect(result.nodes[0].data.videoUrl).toContain("[REMOVED_FOR_SAVE:");
      });

      it("should preserve imageRef in GenerateImage nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "generateImage", {
            imageRef: "asset_generated_123",
            imageUrl: SAMPLE_BASE64_IMAGE,
            aspectRatio: "1:1",
            isGenerating: false,
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.imageRef).toBe("asset_generated_123");
        expect(result.nodes[0].data.aspectRatio).toBe("1:1");
      });

      it("should preserve videoRef in GenerateVideo nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "generateVideo", {
            videoRef: "asset_video_456",
            videoUrl: SAMPLE_BASE64_VIDEO,
            firstFrameRef: "asset_frame_1",
            lastFrameRef: "asset_frame_2",
            aspectRatio: "16:9",
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.videoRef).toBe("asset_video_456");
        expect(result.nodes[0].data.firstFrameRef).toBe("asset_frame_1");
        expect(result.nodes[0].data.lastFrameRef).toBe("asset_frame_2");
        expect(result.nodes[0].data.aspectRatio).toBe("16:9");
      });

      it("should preserve array of asset refs (referenceImageRefs)", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "generateImage", {
            referenceImageRefs: ["asset_ref_1", "asset_ref_2", "asset_ref_3"],
            referenceImageUrls: [SAMPLE_BASE64_IMAGE, SAMPLE_BASE64_IMAGE, SAMPLE_BASE64_IMAGE],
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.referenceImageRefs).toEqual([
          "asset_ref_1",
          "asset_ref_2",
          "asset_ref_3",
        ]);
        // URLs should be stripped
        expect(result.nodes[0].data.referenceImageUrls[0]).toContain("[REMOVED_FOR_SAVE:");
      });
    });

    describe("preserves text content", () => {
      it("should preserve prompt text in Prompt nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "prompt", {
            prompt: "A beautiful sunset over the mountains",
            outputs: { text: "A beautiful sunset over the mountains" },
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.prompt).toBe("A beautiful sunset over the mountains");
        expect(result.nodes[0].data.outputs.text).toBe("A beautiful sunset over the mountains");
      });

      it("should preserve systemPrompt and responsePreview in LLM nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "llm", {
            systemPrompt: "You are a creative writing assistant",
            temperature: 0.7,
            responsePreview: "Here is my creative response...",
            isGenerating: false,
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.systemPrompt).toBe("You are a creative writing assistant");
        expect(result.nodes[0].data.temperature).toBe(0.7);
        expect(result.nodes[0].data.responsePreview).toBe("Here is my creative response...");
      });

      it("should preserve content in StickyNote nodes", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "stickyNote", {
            content: "This is an important note about the workflow",
            color: "yellow",
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.content).toBe("This is an important note about the workflow");
        expect(result.nodes[0].data.color).toBe("yellow");
      });

      it("should preserve text iterator data", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "textIterator", {
            fixedSection: "Character says:",
            variableItems: ["Hello world", "Goodbye world", "How are you?"],
            separator: "Newline",
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.fixedSection).toBe("Character says:");
        expect(result.nodes[0].data.variableItems).toEqual([
          "Hello world",
          "Goodbye world",
          "How are you?",
        ]);
      });
    });

    describe("strips base64 data", () => {
      it("should strip base64 image data URIs", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "imageInput", {
            imageUrl: SAMPLE_BASE64_IMAGE,
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.imageUrl).not.toBe(SAMPLE_BASE64_IMAGE);
        expect(result.nodes[0].data.imageUrl).toContain("[REMOVED_FOR_SAVE:image/png:");
      });

      it("should strip base64 video data URIs", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "videoInput", {
            videoUrl: SAMPLE_BASE64_VIDEO,
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.videoUrl).not.toBe(SAMPLE_BASE64_VIDEO);
        expect(result.nodes[0].data.videoUrl).toContain("[REMOVED_FOR_SAVE:video/mp4:");
      });

      it("should strip base64 from outputs object", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "imageInput", {
            outputs: {
              image: SAMPLE_BASE64_IMAGE,
            },
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.outputs.image).toContain("[REMOVED_FOR_SAVE:");
      });

      it("should strip base64 from nested arrays", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "generateImage", {
            images: [SAMPLE_BASE64_IMAGE, SAMPLE_BASE64_IMAGE],
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.images[0]).toContain("[REMOVED_FOR_SAVE:");
        expect(result.nodes[0].data.images[1]).toContain("[REMOVED_FOR_SAVE:");
      });
    });

    describe("preserves HTTP URLs", () => {
      it("should preserve HTTP URLs (not base64)", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "imageInput", {
            imageRef: "asset_123",
            imageUrl: "https://storage.googleapis.com/bucket/image.png",
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.imageUrl).toBe(
          "https://storage.googleapis.com/bucket/image.png"
        );
      });
    });

    describe("handles edge cases", () => {
      it("should handle null and undefined values", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "imageInput", {
            imageRef: null,
            imageUrl: undefined,
            file: null,
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.imageRef).toBeNull();
        expect(result.nodes[0].data.imageUrl).toBeUndefined();
        expect(result.nodes[0].data.file).toBeNull();
      });

      it("should handle empty arrays", () => {
        const nodes: WorkflowNode[] = [
          createMockNode("1", "generateImage", {
            referenceImageRefs: [],
            images: [],
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.nodes[0].data.referenceImageRefs).toEqual([]);
        expect(result.nodes[0].data.images).toEqual([]);
      });

      it("should handle empty workflow", () => {
        const result = sanitizeWorkflowForSave([], []);

        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
      });
    });

    describe("size calculations", () => {
      it("should report original and sanitized sizes", () => {
        const largeBase64 = "data:image/png;base64," + "A".repeat(100000);
        const nodes: WorkflowNode[] = [
          createMockNode("1", "imageInput", {
            imageUrl: largeBase64,
          }),
        ];

        const result = sanitizeWorkflowForSave(nodes, []);

        expect(result.originalSize).toBeGreaterThan(result.sanitizedSize);
        expect(result.removed).toBeGreaterThan(0);
      });
    });
  });

  describe("calculatePayloadSize", () => {
    it("should calculate size of JSON payload", () => {
      const data = { test: "hello world" };
      const size = calculatePayloadSize(data);

      expect(size).toBeGreaterThan(0);
      expect(size).toBe(JSON.stringify(data).length);
    });
  });

  describe("formatBytes", () => {
    it("should format bytes correctly", () => {
      expect(formatBytes(100)).toBe("100 B");
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1048576)).toBe("1.00 MB");
    });
  });

  describe("complex workflow scenarios", () => {
    it("should correctly sanitize a realistic workflow with multiple node types", () => {
      const nodes: WorkflowNode[] = [
        // Prompt node - text should be preserved
        createMockNode("prompt-1", "prompt", {
          prompt: "A majestic lion in the savanna",
          outputs: { text: "A majestic lion in the savanna" },
        }),
        // Image input with uploaded image - ref should be preserved, base64 stripped
        createMockNode("image-1", "imageInput", {
          imageRef: "asset_user_upload_123",
          imageUrl: SAMPLE_BASE64_IMAGE,
          outputs: { image: SAMPLE_BASE64_IMAGE },
        }),
        // Generate image node - ref and settings preserved
        createMockNode("gen-1", "generateImage", {
          imageRef: "asset_generated_456",
          imageUrl: SAMPLE_BASE64_IMAGE,
          aspectRatio: "16:9",
          isGenerating: false,
          referenceImageRefs: ["asset_user_upload_123"],
        }),
        // LLM node - text preserved
        createMockNode("llm-1", "llm", {
          systemPrompt: "You are a helpful assistant",
          temperature: 0.5,
          responsePreview: "Generated text response here",
        }),
        // Generate video node - all refs preserved
        createMockNode("video-1", "generateVideo", {
          videoRef: "asset_video_789",
          videoUrl: SAMPLE_BASE64_VIDEO,
          firstFrameRef: "asset_frame_start",
          lastFrameRef: "asset_frame_end",
          aspectRatio: "16:9",
          durationSeconds: 6,
        }),
      ];

      const edges: WorkflowEdge[] = [
        { id: "e1", source: "prompt-1", target: "gen-1", sourceHandle: "text", targetHandle: "prompt" },
        { id: "e2", source: "image-1", target: "gen-1", sourceHandle: "image", targetHandle: "reference_images" },
        { id: "e3", source: "gen-1", target: "video-1", sourceHandle: "image", targetHandle: "first_frame" },
      ];

      const result = sanitizeWorkflowForSave(nodes, edges);

      // Verify all asset refs are preserved
      expect(result.nodes.find(n => n.id === "image-1")?.data.imageRef).toBe("asset_user_upload_123");
      expect(result.nodes.find(n => n.id === "gen-1")?.data.imageRef).toBe("asset_generated_456");
      expect(result.nodes.find(n => n.id === "gen-1")?.data.referenceImageRefs).toEqual(["asset_user_upload_123"]);
      expect(result.nodes.find(n => n.id === "video-1")?.data.videoRef).toBe("asset_video_789");
      expect(result.nodes.find(n => n.id === "video-1")?.data.firstFrameRef).toBe("asset_frame_start");
      expect(result.nodes.find(n => n.id === "video-1")?.data.lastFrameRef).toBe("asset_frame_end");

      // Verify all text is preserved
      expect(result.nodes.find(n => n.id === "prompt-1")?.data.prompt).toBe("A majestic lion in the savanna");
      expect(result.nodes.find(n => n.id === "llm-1")?.data.systemPrompt).toBe("You are a helpful assistant");
      expect(result.nodes.find(n => n.id === "llm-1")?.data.responsePreview).toBe("Generated text response here");

      // Verify settings preserved
      expect(result.nodes.find(n => n.id === "gen-1")?.data.aspectRatio).toBe("16:9");
      expect(result.nodes.find(n => n.id === "video-1")?.data.durationSeconds).toBe(6);

      // Verify base64 stripped
      expect(result.nodes.find(n => n.id === "image-1")?.data.imageUrl).toContain("[REMOVED_FOR_SAVE:");
      expect(result.nodes.find(n => n.id === "video-1")?.data.videoUrl).toContain("[REMOVED_FOR_SAVE:");

      // Verify edges preserved
      expect(result.edges).toEqual(edges);
    });
  });
});
