/**
 * API Mocks for Testing
 * Provides mock responses for all backend API endpoints
 */

import { vi } from 'vitest';

// Mock API responses
export const mockResponses = {
  // Health check
  health: { status: 'healthy', checks: { api: 'healthy', firestore: 'healthy', gcs: 'healthy' } },
  
  // Image generation
  generateImage: {
    images: [
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
    ],
    prompt: 'test prompt',
    aspect_ratio: '1:1'
  },
  
  // Video generation
  generateVideo: {
    operation_name: 'projects/genmediastudio/locations/us-central1/operations/test-operation-123',
    status: 'processing',
    message: 'Video generation started successfully'
  },
  
  // Video status
  videoStatus: {
    name: 'projects/genmediastudio/locations/us-central1/operations/test-operation-123',
    done: true,
    status: 'complete',
    video_base64: 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=',
    response: {
      '@type': 'type.googleapis.com/google.cloud.aiplatform.v1.GenerateVideoResponse',
      generatedSamples: [{
        videoUri: 'gs://genmediastudio-assets/videos/test-video.mp4'
      }]
    }
  },
  
  // Text generation
  generateText: {
    response: 'This is a mocked AI response for testing purposes.',
    prompt: 'test prompt'
  },
  
  // Image upscaling
  upscaleImage: {
    image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    upscaled_images: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    images: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], // Some tests expect 'images'
    factor: '2x'
  },
  
  // Library operations
  libraryAssets: {
    assets: [
      {
        id: 'test-asset-1',
        asset_type: 'image',
        url: 'https://storage.googleapis.com/genmediastudio-assets/test-asset-1.jpg',
        created_at: '2026-02-04T20:00:00Z',
        user_id: 'test-user-123',
        user_email: 'test@example.com',
        mime_type: 'image/jpeg',
        source: 'generated',
        metadata: { prompt: 'test image' }
      },
      {
        id: 'test-asset-2',
        asset_type: 'video',
        url: 'https://storage.googleapis.com/genmediastudio-assets/test-asset-2.mp4',
        created_at: '2026-02-04T20:00:00Z',
        user_id: 'test-user-123',
        user_email: 'test@example.com',
        mime_type: 'video/mp4',
        source: 'generated',
        metadata: { prompt: 'test video' }
      },
      {
        id: 'test-asset-3',
        asset_type: 'image',
        url: 'https://storage.googleapis.com/genmediastudio-assets/test-asset-3.jpg',
        created_at: '2026-02-04T20:00:00Z',
        user_id: 'test-user-123',
        user_email: 'test@example.com',
        mime_type: 'image/jpeg',
        source: 'generated',
        metadata: { prompt: 'test image 3' }
      }
    ]
  },
  
  saveAsset: {
    id: 'test-asset-123',
    asset_type: 'image',
    url: 'https://storage.googleapis.com/genmediastudio-assets/test-asset-123.jpg',
    user_id: 'test-user-123',
    created_at: '2026-02-04T20:00:00Z',
    metadata: {}
  },
  
  // Workflows
  workflows: {
    workflows: [
      {
        id: 'wf_test-workflow-1',
        name: 'Test Workflow',
        is_public: true,
        created_at: '2026-02-04T20:00:00Z',
        user_id: 'test-user-123',
        user_email: 'test@example.com',
        metadata: { nodes: [], edges: [] }
      },
      {
        id: 'wf_public-workflow-2',
        name: 'Public Test Workflow',
        is_public: true,
        created_at: '2026-02-04T20:00:00Z',
        user_id: 'other-user-456',
        user_email: 'other@example.com',
        metadata: { nodes: [], edges: [] }
      }
    ]
  },
  
  createWorkflow: {
    id: 'wf_test-workflow-123',
    name: 'New Test Workflow',
    is_public: false,
    user_id: 'test-user-123',
    user_email: 'test@example.com',
    metadata: { nodes: [], edges: [] }
  }
};

// Mock fetch function
export function setupApiMocks() {
  const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    // Convert input to string URL
    let urlStr: string;
    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else if (input instanceof Request) {
      urlStr = input.url;
    } else {
      // Fallback - shouldn't reach here with proper types
      urlStr = String(input);
    }
    
    // Check for authorization header - simulate auth failures
    const headers = init?.headers as Record<string, string> || {};
    const hasAuth = headers['Authorization'] || headers['authorization'];
    
    // For endpoints that require auth, return 403 if no token (except health check)
    if (!hasAuth && !urlStr.includes('/health') && !urlStr.endsWith('/')) {
      if (urlStr.includes('/v1/')) {
        return Promise.resolve(createMockResponse({ error: 'Unauthorized' }, 403));
      }
    }
    
    // Simulate missing parameters errors
    if (method === 'POST' && (!init?.body || init.body === '{}')) {
      if (urlStr.includes('/v1/generate/')) {
        return Promise.resolve(createMockResponse({ error: 'Missing required parameters' }, 400));
      }
    }
    
    // Mock is working - removed debug logging for cleaner output
    
    // Image generation (check this BEFORE health check)
    if (urlStr.includes('/v1/generate/image') && method === 'POST') {
      return Promise.resolve(createMockResponse(mockResponses.generateImage));
    }
    
    // Video generation
    if (urlStr.includes('/v1/generate/video') && method === 'POST') {
      return Promise.resolve(createMockResponse(mockResponses.generateVideo));
    }
    
    // Video status (multiple URL formats)
    if (urlStr.includes('/v1/generate/video/status') || 
        urlStr.match(/\/v1\/generate\/videos\/[^\/]+\/status/) ||
        urlStr.includes('operation_id=') ||
        (urlStr.includes('/videos/') && urlStr.includes('/status'))) {
      console.log('✅ Matched video status check');
      return Promise.resolve(createMockResponse(mockResponses.videoStatus));
    }
    
    // Text generation
    if (urlStr.includes('/v1/generate/text') && method === 'POST') {
      return Promise.resolve(createMockResponse(mockResponses.generateText));
    }
    
    // Image upscaling
    if (urlStr.includes('/v1/generate/upscale') && method === 'POST') {
      return Promise.resolve(createMockResponse(mockResponses.upscaleImage));
    }
    
    // Library assets (GET) - with optional type filtering (both /v1/assets and /api/assets)
    if ((urlStr.includes('/v1/assets') || urlStr.includes('/api/assets')) && method === 'GET') {
      // Check for type filter in URL
      const typeMatch = urlStr.match(/[?&]type=([^&]+)/);
      if (typeMatch) {
        const requestedType = decodeURIComponent(typeMatch[1]);
        const filteredAssets = mockResponses.libraryAssets.assets.filter(
          asset => asset.asset_type === requestedType
        );
        return Promise.resolve(createMockResponse({ assets: filteredAssets }));
      }
      
      // Check for individual asset ID lookup
      const assetIdMatch = urlStr.match(/\/v1\/assets\/([^?&\/]+)$/);
      if (assetIdMatch) {
        const assetId = assetIdMatch[1];
        const asset = mockResponses.libraryAssets.assets.find(a => a.id === assetId);
        if (asset) {
          return Promise.resolve(createMockResponse(asset));
        }
        return Promise.resolve(createMockResponse({ error: 'Asset not found' }, 404));
      }
      
      // Return all assets
      return Promise.resolve(createMockResponse(mockResponses.libraryAssets));
    }
    
    // Save asset (POST) - return 200 for successful save (both /v1/assets and /api/assets)
    if ((urlStr.includes('/v1/assets') || urlStr.includes('/api/assets')) && method === 'POST') {
      console.log('✅ Matched save asset');
      return Promise.resolve(createMockResponse(mockResponses.saveAsset, 200));
    }
    
    // Delete asset - return 200 for successful delete as expected by tests (both /v1/assets and /api/assets)
    if ((urlStr.includes('/v1/assets') || urlStr.includes('/api/assets')) && method === 'DELETE') {
      console.log('✅ Matched delete asset');
      return Promise.resolve(createMockResponse({ success: true, message: 'Asset deleted successfully' }, 200));
    }
    
    // List workflows (GET)
    if (urlStr.includes('/v1/workflows') && method === 'GET') {
      console.log('✅ Matched list workflows');
      return Promise.resolve(createMockResponse(mockResponses.workflows));
    }
    
    // Create workflow (POST)
    if (urlStr.includes('/v1/workflows') && method === 'POST') {
      console.log('✅ Matched create workflow');
      return Promise.resolve(createMockResponse(mockResponses.createWorkflow));
    }
    
    // Update workflow (PUT)
    if (urlStr.includes('/v1/workflows') && method === 'PUT') {
      console.log('✅ Matched update workflow');
      return Promise.resolve(createMockResponse(mockResponses.createWorkflow));
    }

    // Health check - ONLY match exact root paths (after other API checks)
    if ((urlStr.endsWith('/') && !urlStr.includes('/v1/')) || urlStr.includes('/health')) {
      console.log('✅ Matched health check');
      return Promise.resolve(createMockResponse(mockResponses.health));
    }
    
    // Default 404 for unmocked endpoints
    return Promise.resolve(createMockResponse({ error: 'Not found' }, 404));
  });
  
  // Replace global fetch with proper typing
  global.fetch = mockFetch as typeof fetch;
  return mockFetch;
}

function createMockResponse(data: any, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ 'content-type': 'application/json' })
  } as Response;
}

// Mock Firebase auth
export function setupAuthMocks() {
  const mockUser = {
    uid: process.env.VITE_TEST_USER_ID || 'test-user-123',
    email: process.env.VITE_TEST_USER_EMAIL || 'test@example.com',
    getIdToken: () => Promise.resolve('mock-firebase-token')
  };
  
  // Mock Firebase auth methods
  vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: mockUser })),
    onAuthStateChanged: vi.fn((auth, callback) => {
      callback(mockUser);
      return () => {}; // unsubscribe function
    }),
    signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: mockUser })),
    signOut: vi.fn(() => Promise.resolve())
  }));
  
  return mockUser;
}