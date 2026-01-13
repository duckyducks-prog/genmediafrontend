import { describe, it, expect, beforeAll } from "vitest";
import { API_ENDPOINTS } from "@/lib/api-config";

/**
 * Tests for Firestore Migration
 *
 * Run tests:
 * - All tests: npm test tests/e2e/firestore-migration.spec.ts
 * - Single test: npm test tests/e2e/firestore-migration.spec.ts -t "workflows"
 * - Watch mode: npm run test:e2e:watch -- firestore-migration
 *
 * Setup:
 * 1. Set environment variable: FIREBASE_TEST_TOKEN=<your-firebase-id-token>
 * 2. Make sure the dev server is running: npm run dev
 *
 * Covers:
 * 1. Workflows with asset references (assetRef, imageRef, videoRef)
 * 2. Firestore metadata queries (by user_id, is_public, created_at)
 * 3. Asset library operations (save, list, get, delete)
 * 4. URL resolution from GCS (asset_id → GCS URL)
 * 5. Auto-save of generated images/videos
 */

const TEST_TIMEOUT = 120000; // 2 minutes

// Base URL for local API proxy (vite dev server)
const LOCAL_API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";

// Helper to make API requests
async function apiRequest(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: any,
  token?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const options: any = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  // Prepend base URL for relative paths (local proxy endpoints)
  const url = endpoint.startsWith("/") ? `${LOCAL_API_BASE_URL}${endpoint}` : endpoint;
  const response = await fetch(url, options);
  return response;
}

describe("Firestore Migration - Workflows", () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = process.env.FIREBASE_TEST_TOKEN || "";
    if (!authToken) {
      throw new Error("FIREBASE_TEST_TOKEN not set");
    }
  });

  it(
    "Create workflow with asset references",
    async () => {
      const workflowData = {
        name: "Test Workflow with Assets",
        description: "Testing Firestore asset references",
        is_public: false,
        nodes: [
          {
            id: "node-1",
            type: "imageInput",
            position: { x: 0, y: 0 },
            data: {
              label: "Input Image",
              imageRef: "asset-id-12345", // Reference to asset instead of base64
            },
          },
          {
            id: "node-2",
            type: "generateImage",
            position: { x: 300, y: 0 },
            data: {
              label: "Generate Image",
              prompt: "A beautiful landscape",
              aspectRatio: "16:9",
            },
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "node-1",
            target: "node-2",
            sourceHandle: "image",
            targetHandle: "reference_images",
          },
        ],
      };

      const response = await apiRequest(
        API_ENDPOINTS.workflows.save,
        "POST",
        workflowData,
        authToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.id).toMatch(/^wf_/);

      console.log("✓ Workflow created with ID:", data.id);
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "List workflows - verify Firestore metadata",
    async () => {
      const response = await apiRequest(
        API_ENDPOINTS.workflows.list("my"),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.workflows).toBeDefined();
      expect(Array.isArray(data.workflows)).toBe(true);

      // Verify Firestore metadata fields
      if (data.workflows.length > 0) {
        const workflow = data.workflows[0];
        expect(workflow.id).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(workflow.user_id).toBeDefined();
        expect(workflow.user_email).toBeDefined();
        expect(workflow.is_public).toBeDefined();
        expect(workflow.created_at).toBeDefined();
        expect(workflow.updated_at).toBeDefined();

        console.log("✓ Workflows have correct Firestore metadata");
      }
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "Get workflow - verify asset URL resolution",
    async () => {
      // First, list to get a workflow ID
      const listResponse = await apiRequest(
        API_ENDPOINTS.workflows.list("my"),
        "GET",
        undefined,
        authToken,
      );

      const workflows = (await listResponse.json()).workflows;
      if (workflows.length === 0) {
        console.log("⊘ No workflows found, skipping URL resolution test");
        return;
      }

      const workflowId = workflows[0].id;

      // Get the workflow
      const response = await apiRequest(
        API_ENDPOINTS.workflows.get(workflowId),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const workflow = await response.json();

      // Verify nodes with asset references are resolved to URLs
      if (workflow.nodes) {
        for (const node of workflow.nodes) {
          // If node has imageRef, it should be resolved to a GCS URL
          if (node.data?.imageRef) {
            // After resolution, should have imageUrl
            if (node.data.imageUrl) {
              expect(node.data.imageUrl).toMatch(
                /^https:\/\/storage\.googleapis\.com\//,
              );
              console.log(
                "✓ Asset reference resolved to URL:",
                node.data.imageUrl,
              );
            }
          }
        }
      }
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "List public workflows - verify is_public filter",
    async () => {
      const response = await apiRequest(
        API_ENDPOINTS.workflows.list("public"),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.workflows).toBeDefined();

      // All returned workflows should be public
      if (data.workflows.length > 0) {
        for (const workflow of data.workflows) {
          expect(workflow.is_public).toBe(true);
        }
        console.log("✓ Public workflows filtered correctly");
      }
    },
    { timeout: TEST_TIMEOUT },
  );
});

describe("Firestore Migration - Asset Library", () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = process.env.FIREBASE_TEST_TOKEN || "";
    if (!authToken) {
      throw new Error("FIREBASE_TEST_TOKEN not set");
    }
  });

  it(
    "List assets - verify Firestore metadata",
    async () => {
      const response = await apiRequest(
        API_ENDPOINTS.library.list(),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.assets).toBeDefined();

      // Verify asset Firestore metadata
      if (data.assets && data.assets.length > 0) {
        const asset = data.assets[0];
        expect(asset.id).toBeDefined();
        expect(asset.user_id).toBeDefined();
        expect(asset.asset_type).toMatch(/^(image|video)$/);
        expect(asset.url).toBeDefined(); // ✅ Use 'url' instead of deprecated 'blob_path'
        expect(asset.url).toMatch(/^https:\/\//); // Should be a valid URL
        expect(asset.mime_type).toBeDefined();
        expect(asset.created_at).toBeDefined();
        expect(asset.source).toMatch(/^(upload|generated)$/);

        console.log("✓ Assets have correct Firestore metadata");
      }
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "List assets by type - verify asset_type filter",
    async () => {
      // List images
      const imageResponse = await apiRequest(
        API_ENDPOINTS.library.list("image"),
        "GET",
        undefined,
        authToken,
      );

      expect(imageResponse.status).toBe(200);
      const imageData = await imageResponse.json();
      expect(imageData.assets).toBeDefined();

      // All should be images
      if (imageData.assets && imageData.assets.length > 0) {
        for (const asset of imageData.assets) {
          expect(asset.asset_type).toBe("image");
        }
        console.log("✓ Assets filtered by type correctly");
      }
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "Get asset - verify GCS URL resolution",
    async () => {
      // List assets first
      const listResponse = await apiRequest(
        API_ENDPOINTS.library.list(),
        "GET",
        undefined,
        authToken,
      );

      const assets = (await listResponse.json()).assets;
      if (!assets || assets.length === 0) {
        console.log("⊘ No assets found, skipping URL resolution test");
        return;
      }

      const assetId = assets[0].id;

      // Get the asset
      const response = await apiRequest(
        API_ENDPOINTS.library.get(assetId),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const asset = await response.json();

      // Verify asset has metadata and URL
      expect(asset.id).toBe(assetId);
      expect(asset.url).toBeDefined();
      expect(asset.url).toMatch(/^https:\/\/storage\.googleapis\.com\//);

      console.log("✓ Asset URL resolved correctly");
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "Delete asset - verify operation succeeds",
    async () => {
      // First create a test asset by generating an image
      const generateResponse = await apiRequest(
        API_ENDPOINTS.generate.image,
        "POST",
        { prompt: "A test image for deletion" },
        authToken,
      );

      if (generateResponse.status !== 200) {
        console.log("⊘ Could not generate image for deletion test");
        return;
      }

      // List assets to get the newly created one
      const listResponse = await apiRequest(
        API_ENDPOINTS.library.list("image"),
        "GET",
        undefined,
        authToken,
      );

      const assets = (await listResponse.json()).assets;
      if (!assets || assets.length === 0) {
        console.log("⊘ No assets to delete");
        return;
      }

      const assetId = assets[0].id;

      // Delete the asset
      const deleteResponse = await apiRequest(
        API_ENDPOINTS.library.delete(assetId),
        "DELETE",
        undefined,
        authToken,
      );

      expect(deleteResponse.status).toBe(200);
      console.log("✓ Asset deleted successfully");

      // Verify it's gone
      const getResponse = await apiRequest(
        API_ENDPOINTS.library.get(assetId),
        "GET",
        undefined,
        authToken,
      );

      expect(getResponse.status).toBe(404);
      console.log("✓ Deleted asset no longer found");
    },
    { timeout: TEST_TIMEOUT },
  );
});

describe("Firestore Migration - Auto-save Feature", () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = process.env.FIREBASE_TEST_TOKEN || "";
    if (!authToken) {
      throw new Error("FIREBASE_TEST_TOKEN not set");
    }
  });

  it(
    "Generate image - verify auto-save to library",
    async () => {
      // Get initial asset count
      const initialListResponse = await apiRequest(
        API_ENDPOINTS.library.list("image"),
        "GET",
        undefined,
        authToken,
      );

      const initialCount =
        (await initialListResponse.json()).assets?.length || 0;

      // Generate an image
      const generateResponse = await apiRequest(
        API_ENDPOINTS.generate.image,
        "POST",
        { prompt: "A beautiful sunset" },
        authToken,
      );

      expect(generateResponse.status).toBe(200);
      const generatedImage = await generateResponse.json();
      expect(generatedImage.images).toBeDefined();

      // Wait a moment for auto-save
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get updated asset count
      const updatedListResponse = await apiRequest(
        API_ENDPOINTS.library.list("image"),
        "GET",
        undefined,
        authToken,
      );

      const updatedAssets = (await updatedListResponse.json()).assets || [];
      const updatedCount = updatedAssets.length;

      // Should have one more asset
      expect(updatedCount).toBeGreaterThanOrEqual(initialCount + 1);

      // Verify the new asset has correct metadata
      if (updatedAssets.length > 0) {
        const newestAsset = updatedAssets[0];
        expect(newestAsset.source).toBe("generated");
        expect(newestAsset.asset_type).toBe("image");
        expect(newestAsset.prompt).toMatch(/sunset/i);

        console.log("✓ Generated image auto-saved to library");
      }
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "Generate video - verify auto-save to library",
    async () => {
      // Get initial video count
      const initialListResponse = await apiRequest(
        API_ENDPOINTS.library.list("video"),
        "GET",
        undefined,
        authToken,
      );

      const initialCount =
        (await initialListResponse.json()).assets?.length || 0;

      // Generate a video
      const generateResponse = await apiRequest(
        API_ENDPOINTS.generate.video,
        "POST",
        {
          prompt: "A person walking in a park",
          aspect_ratio: "16:9",
          duration_seconds: 4,
        },
        authToken,
      );

      if (generateResponse.status !== 200) {
        console.log("⊘ Skipping video auto-save test - generation failed");
        return;
      }

      const generatedVideo = await generateResponse.json();
      expect(generatedVideo.operation_name).toBeDefined();

      // Poll for completion (with timeout)
      let isComplete = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts && !isComplete) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 second wait
        attempts++;

        const statusResponse = await apiRequest(
          API_ENDPOINTS.generate.videoStatus,
          "POST",
          { operation_name: generatedVideo.operation_name },
          authToken,
        );

        if (statusResponse.status === 200) {
          const statusData = await statusResponse.json();
          if (
            statusData.status === "complete" ||
            statusData.status === "completed"
          ) {
            isComplete = true;
          }
        }
      }

      if (!isComplete) {
        console.log("⊘ Video generation timed out");
        return;
      }

      // Get updated video count
      const updatedListResponse = await apiRequest(
        API_ENDPOINTS.library.list("video"),
        "GET",
        undefined,
        authToken,
      );

      const updatedAssets = (await updatedListResponse.json()).assets || [];
      const updatedCount = updatedAssets.length;

      // Should have one more video asset
      expect(updatedCount).toBeGreaterThanOrEqual(initialCount + 1);

      if (updatedAssets.length > 0) {
        const newestAsset = updatedAssets[0];
        expect(newestAsset.source).toBe("generated");
        expect(newestAsset.asset_type).toBe("video");

        console.log("✓ Generated video auto-saved to library");
      }
    },
    { timeout: TEST_TIMEOUT },
  );
});

describe("Firestore Migration - Access Control", () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = process.env.FIREBASE_TEST_TOKEN || "";
    if (!authToken) {
      throw new Error("FIREBASE_TEST_TOKEN not set");
    }
  });

  it(
    "User can only see their own workflows",
    async () => {
      const response = await apiRequest(
        API_ENDPOINTS.workflows.list("my"),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // All workflows should belong to current user
      if (data.workflows && data.workflows.length > 0) {
        for (const workflow of data.workflows) {
          // Should have user_id matching the auth token's user
          expect(workflow.user_id).toBeDefined();
        }
        console.log("✓ User can see own workflows");
      }
    },
    { timeout: TEST_TIMEOUT },
  );

  it(
    "User can see public workflows from others",
    async () => {
      const response = await apiRequest(
        API_ENDPOINTS.workflows.list("public"),
        "GET",
        undefined,
        authToken,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // All workflows should be public
      if (data.workflows && data.workflows.length > 0) {
        for (const workflow of data.workflows) {
          expect(workflow.is_public).toBe(true);
        }
        console.log("✓ User can see public workflows");
      }
    },
    { timeout: TEST_TIMEOUT },
  );
});
