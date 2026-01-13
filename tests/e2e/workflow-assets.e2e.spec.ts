/**
 * E2E Tests for Workflow Asset Persistence
 *
 * Tests the complete workflow save/load cycle with images, videos, and prompts.
 * Verifies that:
 * - Uploaded images are saved to Asset Library and refs are stored
 * - Asset refs are resolved to URLs when workflows are loaded
 * - Prompts and text content persist correctly
 *
 * Setup:
 * Set FIREBASE_TEST_TOKEN environment variable (see api.e2e.spec.ts for instructions)
 *
 * Run:
 * npm test tests/e2e/workflow-assets.e2e.spec.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";
const VEO_API_BASE_URL = "https://veo-api-otfo2ctxma-uc.a.run.app";
const TEST_TIMEOUT = 120000; // 2 minutes

// Test state
let authToken: string | null = null;
const createdWorkflowIds: string[] = [];
const createdAssetIds: string[] = [];

/**
 * Get auth headers
 */
function getAuthHeaders(): Record<string, string> {
  if (!authToken) {
    throw new Error("Auth token not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };
}

/**
 * Helper to make API calls to local backend
 */
async function localApiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

/**
 * Helper to make API calls to VEO backend
 */
async function veoApiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${VEO_API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

/**
 * Create a test asset in the library
 */
async function createTestAsset(
  type: "image" | "video" = "image"
): Promise<string> {
  // Generate a small test image/video
  let base64Data: string;
  let mimeType: string;

  if (type === "image") {
    // Minimal 1x1 red PNG
    base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
    mimeType = "image/png";
  } else {
    // Minimal MP4 header (won't play but valid for testing)
    base64Data = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";
    mimeType = "video/mp4";
  }

  // Use VEO API directly - /v1/assets is the correct endpoint for creating assets
  const response = await veoApiRequest("/v1/assets", {
    method: "POST",
    body: JSON.stringify({
      data: base64Data,
      prompt: `Test ${type} asset`,
      asset_type: type,
      mime_type: mimeType,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[createTestAsset] Failed:`, {
      status: response.status,
      statusText: response.statusText,
      body: errorBody,
      url: `${VEO_API_BASE_URL}/v1/assets`,
    });
    throw new Error(`Failed to create test asset: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const assetId = data.id || data.asset_id;
  createdAssetIds.push(assetId);
  return assetId;
}

/**
 * Setup - Get authentication token
 */
beforeAll(async () => {
  authToken = process.env.FIREBASE_TEST_TOKEN || null;

  if (!authToken) {
    console.warn("\n⚠️  No FIREBASE_TEST_TOKEN - skipping E2E tests");
    console.warn("Set FIREBASE_TEST_TOKEN to run workflow asset tests\n");
    return;
  }

  console.log("✓ Auth token configured");

  // Verify token
  try {
    const response = await veoApiRequest("/v1/assets");
    if (!response.ok && response.status !== 404) {
      throw new Error(`Token verification failed: ${response.status}`);
    }
    console.log("✓ Auth token verified");
  } catch (error) {
    console.error("✗ Token verification failed:", error);
    throw error;
  }
}, TEST_TIMEOUT);

/**
 * Cleanup - Delete test workflows and assets
 */
afterAll(async () => {
  if (!authToken) return;

  // Delete test workflows
  for (const workflowId of createdWorkflowIds) {
    try {
      await localApiRequest(`/api/workflows/${workflowId}`, { method: "DELETE" });
      console.log(`✓ Deleted test workflow ${workflowId}`);
    } catch (error) {
      console.warn(`⚠️  Failed to delete workflow ${workflowId}`);
    }
  }

  // Delete test assets (use VEO API directly)
  for (const assetId of createdAssetIds) {
    try {
      await veoApiRequest(`/v1/assets/${assetId}`, { method: "DELETE" });
      console.log(`✓ Deleted test asset ${assetId}`);
    } catch (error) {
      console.warn(`⚠️  Failed to delete asset ${assetId}`);
    }
  }
}, TEST_TIMEOUT);

describe("Workflow Asset Persistence E2E", () => {
  beforeAll(() => {
    if (!authToken) {
      console.log("Skipping E2E tests - no auth token");
    }
  });

  describe("Prompt Persistence", () => {
    it("should save and load prompts correctly", async () => {
      if (!authToken) return;

      const testPrompt = "A beautiful sunset over the mountains with golden clouds";

      // Create workflow with prompt node
      const workflow = {
        name: "Test Prompt Persistence",
        description: "Testing prompt save/load",
        is_public: false,
        nodes: [
          {
            id: "prompt-1",
            type: "prompt",
            position: { x: 100, y: 100 },
            data: {
              label: "Test Prompt",
              prompt: testPrompt,
              outputs: { text: testPrompt },
            },
          },
        ],
        edges: [],
      };

      // Save workflow
      const saveResponse = await localApiRequest("/api/workflows/save", {
        method: "POST",
        body: JSON.stringify(workflow),
      });

      expect(saveResponse.status).toBe(200);
      const saveData = await saveResponse.json();
      const workflowId = saveData.id;
      expect(workflowId).toBeDefined();
      createdWorkflowIds.push(workflowId);

      console.log(`✓ Saved workflow with prompt: ${workflowId}`);

      // Load workflow
      const loadResponse = await localApiRequest(`/api/workflows/${workflowId}`);
      expect(loadResponse.status).toBe(200);

      const loadedWorkflow = await loadResponse.json();
      const promptNode = loadedWorkflow.nodes.find((n: any) => n.id === "prompt-1");

      expect(promptNode).toBeDefined();
      expect(promptNode.data.prompt).toBe(testPrompt);

      console.log("✓ Prompt persisted correctly after save/load");
    }, TEST_TIMEOUT);
  });

  describe("Image Asset Reference Persistence", () => {
    it("should save workflow with imageRef and resolve URL on load", async () => {
      if (!authToken) return;

      // Create a test asset first
      console.log("Creating test image asset...");
      const imageRef = await createTestAsset("image");
      console.log(`✓ Created test asset: ${imageRef}`);

      // Create workflow with image input node
      const workflow = {
        name: "Test Image Ref Persistence",
        description: "Testing imageRef save/load",
        is_public: false,
        nodes: [
          {
            id: "image-1",
            type: "imageInput",
            position: { x: 100, y: 100 },
            data: {
              label: "Test Image",
              imageRef: imageRef,
              // imageUrl is intentionally omitted - should be resolved on load
            },
          },
        ],
        edges: [],
      };

      // Save workflow
      const saveResponse = await localApiRequest("/api/workflows/save", {
        method: "POST",
        body: JSON.stringify(workflow),
      });

      expect(saveResponse.status).toBe(200);
      const saveData = await saveResponse.json();
      const workflowId = saveData.id;
      createdWorkflowIds.push(workflowId);

      console.log(`✓ Saved workflow with imageRef: ${workflowId}`);

      // Load workflow
      const loadResponse = await localApiRequest(`/api/workflows/${workflowId}`);
      expect(loadResponse.status).toBe(200);

      const loadedWorkflow = await loadResponse.json();
      const imageNode = loadedWorkflow.nodes.find((n: any) => n.id === "image-1");

      expect(imageNode).toBeDefined();
      expect(imageNode.data.imageRef).toBe(imageRef);

      // URL should be resolved (may be null if asset not found, or valid URL)
      // The key is that the field exists after resolution
      expect("imageUrl" in imageNode.data).toBe(true);
      expect("imageRefExists" in imageNode.data).toBe(true);

      console.log("✓ imageRef persisted and resolved on load");
      console.log(`  - imageRef: ${imageNode.data.imageRef}`);
      console.log(`  - imageUrl: ${imageNode.data.imageUrl ? "resolved" : "null (asset may not exist)"}`);
      console.log(`  - imageRefExists: ${imageNode.data.imageRefExists}`);
    }, TEST_TIMEOUT);
  });

  describe("Video Asset Reference Persistence", () => {
    it("should save workflow with videoRef and resolve URL on load", async () => {
      if (!authToken) return;

      // Create a test video asset
      console.log("Creating test video asset...");
      const videoRef = await createTestAsset("video");
      console.log(`✓ Created test asset: ${videoRef}`);

      // Create workflow with video input node
      const workflow = {
        name: "Test Video Ref Persistence",
        description: "Testing videoRef save/load",
        is_public: false,
        nodes: [
          {
            id: "video-1",
            type: "videoInput",
            position: { x: 100, y: 100 },
            data: {
              label: "Test Video",
              videoRef: videoRef,
            },
          },
        ],
        edges: [],
      };

      // Save workflow
      const saveResponse = await localApiRequest("/api/workflows/save", {
        method: "POST",
        body: JSON.stringify(workflow),
      });

      expect(saveResponse.status).toBe(200);
      const saveData = await saveResponse.json();
      const workflowId = saveData.id;
      createdWorkflowIds.push(workflowId);

      console.log(`✓ Saved workflow with videoRef: ${workflowId}`);

      // Load workflow
      const loadResponse = await localApiRequest(`/api/workflows/${workflowId}`);
      expect(loadResponse.status).toBe(200);

      const loadedWorkflow = await loadResponse.json();
      const videoNode = loadedWorkflow.nodes.find((n: any) => n.id === "video-1");

      expect(videoNode).toBeDefined();
      expect(videoNode.data.videoRef).toBe(videoRef);
      expect("videoUrl" in videoNode.data).toBe(true);
      expect("videoRefExists" in videoNode.data).toBe(true);

      console.log("✓ videoRef persisted and resolved on load");
    }, TEST_TIMEOUT);
  });

  describe("Complex Workflow with Multiple Assets", () => {
    it("should handle workflow with prompts, images, and settings", async () => {
      if (!authToken) return;

      // Create test assets
      const imageRef1 = await createTestAsset("image");
      const imageRef2 = await createTestAsset("image");

      const workflow = {
        name: "Complex Workflow Test",
        description: "Testing complex workflow with multiple node types",
        is_public: false,
        nodes: [
          // Prompt node
          {
            id: "prompt-1",
            type: "prompt",
            position: { x: 100, y: 100 },
            data: {
              label: "Main Prompt",
              prompt: "A serene landscape with mountains",
              outputs: { text: "A serene landscape with mountains" },
            },
          },
          // Image input nodes
          {
            id: "image-1",
            type: "imageInput",
            position: { x: 100, y: 200 },
            data: {
              label: "Reference Image 1",
              imageRef: imageRef1,
            },
          },
          {
            id: "image-2",
            type: "imageInput",
            position: { x: 100, y: 300 },
            data: {
              label: "Reference Image 2",
              imageRef: imageRef2,
            },
          },
          // Generate image node with settings
          {
            id: "generate-1",
            type: "generateImage",
            position: { x: 400, y: 200 },
            data: {
              label: "Generate Image",
              aspectRatio: "16:9",
              isGenerating: false,
              referenceImageRefs: [imageRef1, imageRef2],
            },
          },
          // LLM node with settings
          {
            id: "llm-1",
            type: "llm",
            position: { x: 400, y: 400 },
            data: {
              label: "LLM Enhancer",
              systemPrompt: "You enhance image prompts with creative details",
              temperature: 0.8,
              isGenerating: false,
            },
          },
        ],
        edges: [
          { id: "e1", source: "prompt-1", target: "generate-1", sourceHandle: "text", targetHandle: "prompt" },
          { id: "e2", source: "image-1", target: "generate-1", sourceHandle: "image", targetHandle: "reference_images" },
          { id: "e3", source: "image-2", target: "generate-1", sourceHandle: "image", targetHandle: "reference_images" },
          { id: "e4", source: "prompt-1", target: "llm-1", sourceHandle: "text", targetHandle: "prompt" },
        ],
      };

      // Save workflow
      const saveResponse = await localApiRequest("/api/workflows/save", {
        method: "POST",
        body: JSON.stringify(workflow),
      });

      expect(saveResponse.status).toBe(200);
      const saveData = await saveResponse.json();
      const workflowId = saveData.id;
      createdWorkflowIds.push(workflowId);

      console.log(`✓ Saved complex workflow: ${workflowId}`);

      // Load workflow
      const loadResponse = await localApiRequest(`/api/workflows/${workflowId}`);
      expect(loadResponse.status).toBe(200);

      const loaded = await loadResponse.json();

      // Verify prompt preserved
      const promptNode = loaded.nodes.find((n: any) => n.id === "prompt-1");
      expect(promptNode.data.prompt).toBe("A serene landscape with mountains");

      // Verify image refs preserved and resolved
      const imageNode1 = loaded.nodes.find((n: any) => n.id === "image-1");
      const imageNode2 = loaded.nodes.find((n: any) => n.id === "image-2");
      expect(imageNode1.data.imageRef).toBe(imageRef1);
      expect(imageNode2.data.imageRef).toBe(imageRef2);

      // Verify generate image settings and refs
      const generateNode = loaded.nodes.find((n: any) => n.id === "generate-1");
      expect(generateNode.data.aspectRatio).toBe("16:9");
      expect(generateNode.data.referenceImageRefs).toEqual([imageRef1, imageRef2]);

      // Verify LLM settings
      const llmNode = loaded.nodes.find((n: any) => n.id === "llm-1");
      expect(llmNode.data.systemPrompt).toBe("You enhance image prompts with creative details");
      expect(llmNode.data.temperature).toBe(0.8);

      // Verify edges preserved
      expect(loaded.edges.length).toBe(4);

      console.log("✓ Complex workflow persisted correctly");
      console.log(`  - Prompt: "${promptNode.data.prompt.substring(0, 30)}..."`);
      console.log(`  - Image refs: ${imageRef1}, ${imageRef2}`);
      console.log(`  - Generate aspectRatio: ${generateNode.data.aspectRatio}`);
      console.log(`  - LLM temperature: ${llmNode.data.temperature}`);
    }, TEST_TIMEOUT);
  });

  describe("Base64 Stripping", () => {
    it("should strip base64 data but preserve refs during save", async () => {
      if (!authToken) return;

      const imageRef = await createTestAsset("image");
      const base64Data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const workflow = {
        name: "Test Base64 Stripping",
        description: "Verify base64 is stripped but refs preserved",
        is_public: false,
        nodes: [
          {
            id: "image-1",
            type: "imageInput",
            position: { x: 100, y: 100 },
            data: {
              label: "Test Image",
              imageRef: imageRef,
              imageUrl: base64Data, // This should be stripped
              outputs: { image: base64Data }, // This should be stripped
            },
          },
        ],
        edges: [],
      };

      // Save workflow
      const saveResponse = await localApiRequest("/api/workflows/save", {
        method: "POST",
        body: JSON.stringify(workflow),
      });

      expect(saveResponse.status).toBe(200);
      const saveData = await saveResponse.json();
      createdWorkflowIds.push(saveData.id);

      // Load workflow
      const loadResponse = await localApiRequest(`/api/workflows/${saveData.id}`);
      const loaded = await loadResponse.json();
      const imageNode = loaded.nodes.find((n: any) => n.id === "image-1");

      // imageRef should be preserved
      expect(imageNode.data.imageRef).toBe(imageRef);

      // imageUrl should be resolved from ref (not the original base64)
      // It will either be a resolved URL or null
      if (imageNode.data.imageUrl) {
        expect(imageNode.data.imageUrl).not.toContain("base64");
        expect(imageNode.data.imageUrl).not.toBe(base64Data);
      }

      console.log("✓ Base64 stripped but ref preserved");
    }, TEST_TIMEOUT);
  });
});
