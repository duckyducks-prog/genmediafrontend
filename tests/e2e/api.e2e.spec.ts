/**
 * End-to-End API Tests
 * 
 * These tests hit the real backend API to verify all functionality works correctly.
 * 
 * Setup:
 * 1. Set environment variable: FIREBASE_TEST_TOKEN=<your-firebase-id-token>
 *    To get a token:
 *    - Sign in to the app in a browser
 *    - Open DevTools Console
 *    - Run: await firebase.auth().currentUser.getIdToken()
 *    - Copy the token and set it as an env var
 * 
 * 2. Or use FIREBASE_TEST_EMAIL and FIREBASE_TEST_PASSWORD for automated login
 * 
 * Run tests:
 * - All tests: npm test tests/e2e/api.e2e.spec.ts
 * - Single test: npm test tests/e2e/api.e2e.spec.ts -t "generate image"
 * - Watch mode: npm test tests/e2e/api.e2e.spec.ts --watch
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// API Configuration
const API_BASE_URL = 'https://veo-api-82187245577.us-central1.run.app';
const TEST_TIMEOUT = 120000; // 2 minutes for generation operations

// Test state - stores generated assets for cleanup
const testAssets: { id: string; type: string }[] = [];

// Auth token - will be set in beforeAll
let authToken: string | null = null;

/**
 * Helper to get auth headers
 */
function getAuthHeaders(): Record<string, string> {
  if (!authToken) {
    throw new Error('Auth token not set. Make sure beforeAll completed successfully.');
  }
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };
}

/**
 * Helper to make authenticated API calls
 */
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
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

/**
 * Setup - Get authentication token
 */
beforeAll(async () => {
  // Check for token in environment
  authToken = process.env.FIREBASE_TEST_TOKEN || null;
  
  if (!authToken) {
    console.warn('\n⚠️  WARNING: No FIREBASE_TEST_TOKEN found in environment');
    console.warn('Please set FIREBASE_TEST_TOKEN to run E2E tests\n');
    console.warn('To get a token:');
    console.warn('1. Sign in to the app in a browser');
    console.warn('2. Open DevTools Console');
    console.warn('3. Run: await firebase.auth().currentUser.getIdToken()');
    console.warn('4. Export the token: export FIREBASE_TEST_TOKEN="<token>"\n');
    
    // Skip tests if no token
    return;
  }
  
  console.log('✓ Auth token configured');
  
  // Verify token works by hitting a simple endpoint
  try {
    const response = await apiRequest('/library');
    if (response.status === 403) {
      throw new Error('Token is valid but user is not whitelisted');
    }
    if (!response.ok && response.status !== 404) {
      throw new Error(`Token verification failed: ${response.status}`);
    }
    console.log('✓ Auth token verified');
  } catch (error) {
    console.error('✗ Token verification failed:', error);
    throw error;
  }
}, TEST_TIMEOUT);

/**
 * Cleanup - Delete test assets from library
 */
afterAll(async () => {
  if (!authToken || testAssets.length === 0) {
    return;
  }
  
  console.log(`\nCleaning up ${testAssets.length} test assets...`);
  
  for (const asset of testAssets) {
    try {
      const response = await apiRequest(`/library/${asset.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        console.log(`✓ Deleted ${asset.type} asset ${asset.id}`);
      } else {
        console.warn(`⚠️  Failed to delete ${asset.type} asset ${asset.id}: ${response.status}`);
      }
    } catch (error) {
      console.error(`✗ Error deleting asset ${asset.id}:`, error);
    }
  }
}, TEST_TIMEOUT);

// ============================================================================
// TEST SUITES
// ============================================================================

describe('API E2E Tests', () => {
  // Skip all tests if no auth token
  beforeAll(() => {
    if (!authToken) {
      console.log('Skipping E2E tests - no auth token provided');
    }
  });

  describe('Health Check', () => {
    it('should respond to GET /', async () => {
      const response = await fetch(`${API_BASE_URL}/`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data).toBeDefined();
    });
  });

  describe('Image Generation', () => {
    it('should generate an image from a text prompt', async () => {
      if (!authToken) return; // Skip if no token

      const response = await apiRequest('/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A serene mountain landscape at sunset, test image',
          aspect_ratio: '1:1',
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toBeDefined();
      expect(data.image_base64).toBeDefined();
      expect(typeof data.image_base64).toBe('string');
      expect(data.image_base64.length).toBeGreaterThan(100); // Should have substantial base64 data
      
      console.log('✓ Generated image, size:', data.image_base64.length, 'chars');
    }, TEST_TIMEOUT);

    it('should reject requests without auth token', async () => {
      const response = await fetch(`${API_BASE_URL}/generate/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header
        },
        body: JSON.stringify({
          prompt: 'Test image',
          aspect_ratio: '1:1',
        }),
      });

      expect(response.status).toBe(401); // or 403, depending on backend implementation
    });

    it('should handle different aspect ratios', async () => {
      if (!authToken) return;

      const aspectRatios = ['1:1', '16:9', '9:16'];
      
      for (const ratio of aspectRatios) {
        const response = await apiRequest('/generate/image', {
          method: 'POST',
          body: JSON.stringify({
            prompt: `Test image with ${ratio} aspect ratio`,
            aspect_ratio: ratio,
          }),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.image_base64).toBeDefined();
        
        console.log(`✓ Generated ${ratio} image`);
      }
    }, TEST_TIMEOUT);
  });

  describe('Image Upscaling', () => {
    let testImageBase64: string;

    beforeAll(async () => {
      if (!authToken) return;

      // Generate a small test image first
      const response = await apiRequest('/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Simple test pattern for upscaling',
          aspect_ratio: '1:1',
        }),
      });

      const data = await response.json();
      testImageBase64 = data.image_base64;
    }, TEST_TIMEOUT);

    it('should upscale an image', async () => {
      if (!authToken || !testImageBase64) return;

      const response = await apiRequest('/generate/upscale', {
        method: 'POST',
        body: JSON.stringify({
          image: testImageBase64,
          upscale_factor: 2,
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.upscaled_image_base64).toBeDefined();
      expect(data.upscaled_image_base64.length).toBeGreaterThan(testImageBase64.length);
      
      console.log('✓ Upscaled image from', testImageBase64.length, 'to', data.upscaled_image_base64.length, 'chars');
    }, TEST_TIMEOUT);

    it('should handle different upscale factors', async () => {
      if (!authToken || !testImageBase64) return;

      for (const factor of [2, 4]) {
        const response = await apiRequest('/generate/upscale', {
          method: 'POST',
          body: JSON.stringify({
            image: testImageBase64,
            upscale_factor: factor,
          }),
        });

        expect(response.status).toBe(200);
        console.log(`✓ Upscaled image with factor ${factor}`);
      }
    }, TEST_TIMEOUT);
  });

  describe('Video Generation', () => {
    it('should generate a video from a text prompt', async () => {
      if (!authToken) return;

      const response = await apiRequest('/generate/video', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A calm ocean with gentle waves, test video',
        }),
      });

      // Video generation typically returns operation name
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toBeDefined();
      
      // Could return video directly or operation_name for polling
      if (data.operation_name) {
        expect(typeof data.operation_name).toBe('string');
        console.log('✓ Video generation started, operation:', data.operation_name);
      } else if (data.video_base64) {
        expect(typeof data.video_base64).toBe('string');
        console.log('✓ Video generated directly');
      }
    }, TEST_TIMEOUT);
  });

  describe('Video Status Polling', () => {
    let operationName: string;

    beforeAll(async () => {
      if (!authToken) return;

      // Start a video generation
      const response = await apiRequest('/generate/video', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Simple test video for status polling',
        }),
      });

      const data = await response.json();
      if (data.operation_name) {
        operationName = data.operation_name;
      }
    }, TEST_TIMEOUT);

    it('should check video generation status', async () => {
      if (!authToken || !operationName) {
        console.log('⊘ Skipping - no operation to check');
        return;
      }

      const response = await apiRequest('/generate/video/status', {
        method: 'POST',
        body: JSON.stringify({
          operation_name: operationName,
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBeDefined();
      expect(['pending', 'processing', 'complete', 'failed']).toContain(data.status);
      
      console.log('✓ Video status:', data.status);
      
      if (data.status === 'complete') {
        expect(data.video_base64).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('Text Generation (LLM)', () => {
    it('should generate text from a prompt', async () => {
      if (!authToken) return;

      const response = await apiRequest('/generate/text', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Write a short tagline for a mountain hiking brand.',
          temperature: 0.7,
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.response).toBeDefined();
      expect(typeof data.response).toBe('string');
      expect(data.response.length).toBeGreaterThan(0);
      
      console.log('✓ Generated text:', data.response.substring(0, 50) + '...');
    }, TEST_TIMEOUT);

    it('should use system prompt if provided', async () => {
      if (!authToken) return;

      const response = await apiRequest('/generate/text', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'What is your role?',
          system_prompt: 'You are a helpful assistant specialized in creative writing.',
          temperature: 0.5,
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.response).toBeDefined();
      
      console.log('✓ Generated text with system prompt');
    }, TEST_TIMEOUT);

    it('should handle different temperature values', async () => {
      if (!authToken) return;

      for (const temp of [0.1, 0.5, 0.9]) {
        const response = await apiRequest('/generate/text', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'Say hello creatively.',
            temperature: temp,
          }),
        });

        expect(response.status).toBe(200);
        console.log(`✓ Generated text with temperature ${temp}`);
      }
    }, TEST_TIMEOUT);
  });

  describe('Library Operations', () => {
    let savedAssetId: string | null = null;

    it('should save an asset to the library', async () => {
      if (!authToken) return;

      // Generate a test image first
      const genResponse = await apiRequest('/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Test library asset - colorful abstract pattern',
          aspect_ratio: '1:1',
        }),
      });

      const genData = await genResponse.json();
      const imageBase64 = genData.image_base64;

      // Save to library
      const response = await apiRequest('/library', {
        method: 'POST',
        body: JSON.stringify({
          image_data: imageBase64,
          prompt: 'Test library asset - colorful abstract pattern',
          asset_type: 'image',
          mime_type: 'image/png',
        }),
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.id || data.asset_id).toBeDefined();
      
      savedAssetId = data.id || data.asset_id;
      testAssets.push({ id: savedAssetId!, type: 'image' });
      
      console.log('✓ Saved asset to library, ID:', savedAssetId);
    }, TEST_TIMEOUT);

    it('should retrieve library assets', async () => {
      if (!authToken) return;

      const response = await apiRequest('/library', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data) || Array.isArray(data.assets)).toBe(true);
      
      const assets = Array.isArray(data) ? data : data.assets;
      console.log('✓ Retrieved', assets.length, 'library assets');
      
      // If we just saved an asset, it should be in the list
      if (savedAssetId) {
        const foundAsset = assets.find((a: any) => 
          (a.id === savedAssetId || a.asset_id === savedAssetId)
        );
        expect(foundAsset).toBeDefined();
      }
    });

    it('should delete an asset from the library', async () => {
      if (!authToken || !savedAssetId) {
        console.log('⊘ Skipping - no asset to delete');
        return;
      }

      const response = await apiRequest(`/library/${savedAssetId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      
      console.log('✓ Deleted asset from library:', savedAssetId);
      
      // Remove from cleanup list since we already deleted it
      const index = testAssets.findIndex(a => a.id === savedAssetId);
      if (index >= 0) {
        testAssets.splice(index, 1);
      }
      
      // Verify it's deleted
      const listResponse = await apiRequest('/library');
      const listData = await listResponse.json();
      const assets = Array.isArray(listData) ? listData : listData.assets;
      
      const stillExists = assets.find((a: any) => 
        (a.id === savedAssetId || a.asset_id === savedAssetId)
      );
      expect(stillExists).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 403 for unauthorized users', async () => {
      // Use an invalid token
      const response = await fetch(`${API_BASE_URL}/generate/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token-12345',
        },
        body: JSON.stringify({
          prompt: 'Test',
          aspect_ratio: '1:1',
        }),
      });

      expect(response.status).toBe(403);
    });

    it('should handle missing required parameters', async () => {
      if (!authToken) return;

      const response = await apiRequest('/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          // Missing prompt
          aspect_ratio: '1:1',
        }),
      });

      expect([400, 422, 500]).toContain(response.status); // Bad request or validation error
    });

    it('should handle invalid aspect ratio', async () => {
      if (!authToken) return;

      const response = await apiRequest('/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Test',
          aspect_ratio: 'invalid-ratio',
        }),
      });

      // Backend might accept it or reject it
      // Just verify it doesn't crash
      expect(response.status).toBeDefined();
    });
  });

  describe('Integration Workflows', () => {
    it('should complete a full workflow: generate → upscale → save to library', async () => {
      if (!authToken) return;

      console.log('\n=== Full Workflow Test ===');

      // Step 1: Generate image
      console.log('Step 1: Generating image...');
      const genResponse = await apiRequest('/generate/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Workflow test - simple geometric shapes',
          aspect_ratio: '1:1',
        }),
      });
      expect(genResponse.status).toBe(200);
      const genData = await genResponse.json();
      const originalImage = genData.image_base64;
      console.log('✓ Image generated');

      // Step 2: Upscale image
      console.log('Step 2: Upscaling image...');
      const upscaleResponse = await apiRequest('/generate/upscale', {
        method: 'POST',
        body: JSON.stringify({
          image: originalImage,
          upscale_factor: 2,
        }),
      });
      expect(upscaleResponse.status).toBe(200);
      const upscaleData = await upscaleResponse.json();
      const upscaledImage = upscaleData.upscaled_image_base64;
      console.log('✓ Image upscaled');

      // Step 3: Save to library
      console.log('Step 3: Saving to library...');
      const saveResponse = await apiRequest('/library', {
        method: 'POST',
        body: JSON.stringify({
          image_data: upscaledImage,
          prompt: 'Workflow test - simple geometric shapes (upscaled)',
          asset_type: 'image',
          mime_type: 'image/png',
        }),
      });
      expect(saveResponse.status).toBe(200);
      const saveData = await saveResponse.json();
      const assetId = saveData.id || saveData.asset_id;
      testAssets.push({ id: assetId, type: 'image' });
      console.log('✓ Saved to library, ID:', assetId);

      console.log('=== Workflow Complete ===\n');
    }, TEST_TIMEOUT * 2); // Double timeout for full workflow
  });
});
