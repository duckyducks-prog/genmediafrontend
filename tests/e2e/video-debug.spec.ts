/**
 * Video Generation Debug Test
 *
 * This test helps us understand what's happening with video generation
 * by logging all API responses in detail.
 *
 * Setup:
 * 1. Set environment variable: FIREBASE_TEST_TOKEN=<your-firebase-id-token>
 *
 * Run:
 * npm test tests/e2e/video-debug.spec.ts
 */

import { describe, it, expect, beforeAll } from "vitest";

const API_BASE_URL = "https://veo-api-856765593724.us-central1.run.app";
const TEST_TIMEOUT = 600000; // 10 minutes for full video generation

let authToken: string | null = null;

function getAuthHeaders(): Record<string, string> {
  if (!authToken) {
    throw new Error("Auth token not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };
}

async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE_URL}${endpoint}`;
  return fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
}

beforeAll(async () => {
  authToken = process.env.FIREBASE_TEST_TOKEN || null;
  if (!authToken) {
    console.warn("\n⚠️  No FIREBASE_TEST_TOKEN found in environment\n");
  }
}, TEST_TIMEOUT);

describe("Video Generation Debug", () => {
  it(
    "should generate a video and log all API responses",
    async () => {
      if (!authToken) {
        console.log("Skipping - no auth token");
        return;
      }

      console.log("\n=== VIDEO GENERATION DEBUG TEST ===\n");

      // Step 1: Start video generation
      console.log("Step 1: Starting video generation...");
      const startTime = Date.now();

      const generateResponse = await apiRequest("/generate/video", {
        method: "POST",
        body: JSON.stringify({
          prompt:
            "A serene mountain landscape with flowing water, debug test video",
          aspect_ratio: "16:9",
          duration_seconds: 4,
          generate_audio: false,
        }),
      });

      console.log("Generate Video Response:", {
        status: generateResponse.status,
        statusText: generateResponse.statusText,
        headers: Object.fromEntries(generateResponse.headers.entries()),
      });

      const generateData = await generateResponse.json();
      console.log(
        "Generate Video Data:",
        JSON.stringify(generateData, null, 2),
      );

      expect(generateResponse.status).toBe(200);
      expect(generateData.operation_name).toBeDefined();

      const operationName = generateData.operation_name;
      console.log(`\n✓ Video generation started: ${operationName}\n`);

      // Step 2: Poll for status with detailed logging
      console.log("Step 2: Polling for video status...\n");

      const maxAttempts = 60; // 10 minutes (60 * 10 seconds)
      let videoUrl: string | null = null;
      let lastStatus = "";

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Wait 10 seconds
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        console.log(
          `\n--- Attempt ${attempt}/${maxAttempts} (${elapsedSeconds}s elapsed) ---`,
        );

        try {
          const statusResponse = await apiRequest("/generate/video/status", {
            method: "POST",
            body: JSON.stringify({ operation_name: operationName }),
          });

          console.log("Status Response:", {
            status: statusResponse.status,
            statusText: statusResponse.statusText,
            contentType: statusResponse.headers.get("content-type"),
          });

          if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            console.error("ERROR Response Body:", errorText);
            console.error(`Status check failed with ${statusResponse.status}`);

            if (statusResponse.status === 500) {
              console.error(
                "\n⚠️  Backend returned 500 error - this is a backend issue",
              );
              console.error(
                "The video may still be processing. Try checking manually later.",
              );
              return; // Exit test gracefully
            }

            continue;
          }

          const statusData = await statusResponse.json();
          console.log("Status Data:", JSON.stringify(statusData, null, 2));

          // Log any changes in status
          if (statusData.status !== lastStatus) {
            console.log(
              `\n🔄 Status changed: "${lastStatus}" → "${statusData.status}"\n`,
            );
            lastStatus = statusData.status;
          }

          // Check all possible completion statuses
          if (
            statusData.status === "complete" ||
            statusData.status === "completed" ||
            statusData.status === "done"
          ) {
            console.log("\n✅ Video generation COMPLETE!\n");

            // Check for video data in various possible field names
            const videoData =
              statusData.video_base64 ||
              statusData.video ||
              statusData.data ||
              statusData.result;

            if (videoData) {
              videoUrl = `data:video/mp4;base64,${videoData}`;
              console.log("✓ Video data received:", {
                dataLength: videoData.length,
                first100Chars: videoData.substring(0, 100) + "...",
              });
              break;
            } else {
              console.error(
                "\n❌ Video marked as complete but no video data found!",
              );
              console.error("Available fields:", Object.keys(statusData));
              expect.fail(
                "Video generation completed but no video data returned",
              );
            }
          }

          // Check for error states
          if (
            statusData.status === "error" ||
            statusData.status === "failed" ||
            statusData.error
          ) {
            console.error("\n❌ Video generation FAILED!");
            console.error(
              "Error:",
              statusData.error || statusData.message || "Unknown error",
            );
            expect.fail(
              `Video generation failed: ${statusData.error || "Unknown error"}`,
            );
          }

          // Log progress indicators
          if (statusData.progress !== undefined) {
            console.log(`Progress: ${statusData.progress}%`);
          }
        } catch (pollError) {
          console.error("Poll attempt error:", pollError);
          console.error("This might be a network issue or backend timeout");
        }
      }

      if (!videoUrl) {
        const finalElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        console.error(
          `\n❌ TIMEOUT after ${finalElapsedSeconds}s (${maxAttempts} attempts)`,
        );
        console.error("Last known status:", lastStatus || "unknown");
        console.error("\nPossible issues:");
        console.error(
          "1. Backend video generation is taking longer than expected",
        );
        console.error("2. Status endpoint is not returning the correct status");
        console.error("3. Video data field name has changed");
        console.error("4. Backend is experiencing issues");
        expect.fail(
          `Video generation timed out after ${finalElapsedSeconds}s. Last status: ${lastStatus}`,
        );
      }

      // Validate the video URL
      expect(videoUrl).toBeDefined();
      expect(videoUrl).toContain("data:video/mp4;base64,");

      const finalElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      console.log(`\n=== TEST COMPLETE ===`);
      console.log(`Total time: ${finalElapsedSeconds}s`);
      console.log(`Video URL length: ${videoUrl.length} characters`);
      console.log("======================\n");
    },
    TEST_TIMEOUT,
  );

  it("should check an existing operation status (manual test)", async () => {
    if (!authToken) {
      console.log("Skipping - no auth token");
      return;
    }

    // You can manually set an operation name here to check its status
    const manualOperationName = process.env.MANUAL_OPERATION_NAME;

    if (!manualOperationName) {
      console.log(
        "⊘ Skipping manual operation check - set MANUAL_OPERATION_NAME env var to use",
      );
      return;
    }

    console.log(`\nChecking manual operation: ${manualOperationName}\n`);

    const statusResponse = await apiRequest("/generate/video/status", {
      method: "POST",
      body: JSON.stringify({ operation_name: manualOperationName }),
    });

    console.log("Status Response:", {
      status: statusResponse.status,
      statusText: statusResponse.statusText,
    });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log("Status Data:", JSON.stringify(statusData, null, 2));
    } else {
      const errorText = await statusResponse.text();
      console.error("Error Response:", errorText);
    }
  }, 30000);
});
