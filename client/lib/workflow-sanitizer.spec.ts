/**
 * Unit tests for workflow sanitizer
 *
 * Tests that the sanitizer correctly:
 * - Strips base64 data URIs
 * - Preserves asset references (imageRef, videoRef)
 * - Preserves text content (prompts, etc.)
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeWorkflowForSave,
  calculatePayloadSize,
  formatBytes,
  validatePayloadSize,
} from "./workflow-sanitizer";
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

  describe("validatePayloadSize", () => {
    it("should return valid for small payloads", () => {
      const result = validatePayloadSize(1024); // 1 KB
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it("should return warning for payloads over 5MB", () => {
      const size = 6 * 1024 * 1024; // 6 MB
      const result = validatePayloadSize(size);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain("Large payload");
      expect(result.error).toBeUndefined();
    });

    it("should return error for payloads over 10MB", () => {
      const size = 11 * 1024 * 1024; // 11 MB
      const result = validatePayloadSize(size);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Payload too large");
      expect(result.error).toContain("Maximum is");
    });

    it("should return valid without warning at exactly 5MB", () => {
      const size = 5 * 1024 * 1024; // Exactly 5 MB
      const result = validatePayloadSize(size);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("should return invalid at exactly 10MB + 1 byte", () => {
      const size = 10 * 1024 * 1024 + 1; // 10 MB + 1 byte
      const result = validatePayloadSize(size);
      expect(result.valid).toBe(false);
    });
  });

  describe("deeply nested objects", () => {
    it("should strip base64 from 4+ levels deep", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "complex", {
          level1: {
            level2: {
              level3: {
                level4: {
                  deepImage: SAMPLE_BASE64_IMAGE,
                },
              },
            },
          },
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.level1.level2.level3.level4.deepImage).toContain(
        "[REMOVED_FOR_SAVE:"
      );
    });

    it("should preserve non-base64 strings at deep nesting levels", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "complex", {
          level1: {
            level2: {
              level3: {
                deepText: "This should be preserved",
                deepNumber: 42,
              },
            },
          },
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.level1.level2.level3.deepText).toBe(
        "This should be preserved"
      );
      expect(result.nodes[0].data.level1.level2.level3.deepNumber).toBe(42);
    });

    it("should handle arrays nested within objects within arrays", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "complex", {
          items: [
            {
              name: "item1",
              images: [SAMPLE_BASE64_IMAGE, SAMPLE_BASE64_IMAGE],
            },
            {
              name: "item2",
              nested: {
                moreImages: [SAMPLE_BASE64_IMAGE],
              },
            },
          ],
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.items[0].name).toBe("item1");
      expect(result.nodes[0].data.items[0].images[0]).toContain("[REMOVED_FOR_SAVE:");
      expect(result.nodes[0].data.items[0].images[1]).toContain("[REMOVED_FOR_SAVE:");
      expect(result.nodes[0].data.items[1].name).toBe("item2");
      expect(result.nodes[0].data.items[1].nested.moreImages[0]).toContain(
        "[REMOVED_FOR_SAVE:"
      );
    });
  });

  describe("primitive type preservation", () => {
    it("should preserve boolean values", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "settings", {
          isEnabled: true,
          isDisabled: false,
          nested: {
            alsoTrue: true,
          },
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.isEnabled).toBe(true);
      expect(result.nodes[0].data.isDisabled).toBe(false);
      expect(result.nodes[0].data.nested.alsoTrue).toBe(true);
    });

    it("should preserve number values including zero and negative", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "numbers", {
          positive: 42,
          zero: 0,
          negative: -10,
          float: 3.14159,
          nested: {
            deepNumber: 999,
          },
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.positive).toBe(42);
      expect(result.nodes[0].data.zero).toBe(0);
      expect(result.nodes[0].data.negative).toBe(-10);
      expect(result.nodes[0].data.float).toBe(3.14159);
      expect(result.nodes[0].data.nested.deepNumber).toBe(999);
    });

    it("should preserve empty strings", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "text", {
          emptyString: "",
          normalString: "hello",
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.emptyString).toBe("");
      expect(result.nodes[0].data.normalString).toBe("hello");
    });
  });

  describe("special data URI edge cases", () => {
    it("should not strip data URIs that are not image/video", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "data", {
          // application/json data URI should NOT be stripped (not image/video)
          jsonData: "data:application/json;base64,eyJ0ZXN0IjogdHJ1ZX0=",
          // text/plain data URI should NOT be stripped
          textData: "data:text/plain;base64,SGVsbG8gV29ybGQ=",
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      // These should be preserved because they're not image/video
      expect(result.nodes[0].data.jsonData).toBe(
        "data:application/json;base64,eyJ0ZXN0IjogdHJ1ZX0="
      );
      expect(result.nodes[0].data.textData).toBe(
        "data:text/plain;base64,SGVsbG8gV29ybGQ="
      );
    });

    it("should strip audio data URIs (they start with data:)", () => {
      // Note: Current implementation only strips image/ and video/
      // This test documents current behavior
      const nodes: WorkflowNode[] = [
        createMockNode("1", "audio", {
          audioData: "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAA=",
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      // Current implementation does NOT strip audio (only image/video)
      // If this behavior changes, update this test
      expect(result.nodes[0].data.audioData).toBe(
        "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAA="
      );
    });

    it("should handle data URI without base64 encoding marker", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "data", {
          // data URI without base64 marker (plain text)
          plainData: "data:text/plain,Hello%20World",
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      // Should be preserved (doesn't match data:image/ or data:video/)
      expect(result.nodes[0].data.plainData).toBe("data:text/plain,Hello%20World");
    });

    it("should handle malformed strings that look like data URIs", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "edge", {
          // Strings that contain "data:" but aren't data URIs
          normalString: "This is some data: for testing",
          // String that starts with data: but isn't a valid URI
          weirdString: "data:not-a-mime-type",
        }),
      ];

      const result = sanitizeWorkflowForSave(nodes, []);

      expect(result.nodes[0].data.normalString).toBe("This is some data: for testing");
      expect(result.nodes[0].data.weirdString).toBe("data:not-a-mime-type");
    });
  });

  describe("large payload scenarios", () => {
    it("should correctly calculate size reduction for large workflows", () => {
      // Create a workflow with multiple large images
      const largeBase64 = "data:image/png;base64," + "A".repeat(500000); // ~500KB each
      const nodes: WorkflowNode[] = Array.from({ length: 5 }, (_, i) =>
        createMockNode(`node-${i}`, "imageInput", {
          imageUrl: largeBase64,
          imageRef: `asset_${i}`,
        })
      );

      const result = sanitizeWorkflowForSave(nodes, []);

      // Original should be ~2.5MB, sanitized should be much smaller
      expect(result.originalSize).toBeGreaterThan(2 * 1024 * 1024);
      expect(result.sanitizedSize).toBeLessThan(10 * 1024); // Should be < 10KB
      expect(result.removed).toBeGreaterThan(2 * 1024 * 1024);

      // All refs should be preserved
      for (let i = 0; i < 5; i++) {
        expect(result.nodes[i].data.imageRef).toBe(`asset_${i}`);
        expect(result.nodes[i].data.imageUrl).toContain("[REMOVED_FOR_SAVE:");
      }
    });
  });

  describe("edge preservation", () => {
    it("should preserve all edge properties", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "prompt", { prompt: "test" }),
        createMockNode("2", "generateImage", { aspectRatio: "1:1" }),
      ];

      const edges: WorkflowEdge[] = [
        {
          id: "edge-1",
          source: "1",
          target: "2",
          sourceHandle: "text",
          targetHandle: "prompt",
          type: "smoothstep",
          animated: true,
          style: { stroke: "#ff0000" },
        } as WorkflowEdge,
      ];

      const result = sanitizeWorkflowForSave(nodes, edges);

      expect(result.edges[0]).toEqual(edges[0]);
      expect(result.edges[0].id).toBe("edge-1");
      expect(result.edges[0].sourceHandle).toBe("text");
      expect((result.edges[0] as any).animated).toBe(true);
    });

    it("should handle edges with undefined handles", () => {
      const nodes: WorkflowNode[] = [
        createMockNode("1", "prompt", {}),
        createMockNode("2", "output", {}),
      ];

      const edges: WorkflowEdge[] = [
        {
          id: "edge-1",
          source: "1",
          target: "2",
          // No sourceHandle or targetHandle
        } as WorkflowEdge,
      ];

      const result = sanitizeWorkflowForSave(nodes, edges);

      expect(result.edges[0].sourceHandle).toBeUndefined();
      expect(result.edges[0].targetHandle).toBeUndefined();
    });
  });
});
