/**
 * Centralized API Configuration
 *
 * This file is the single source of truth for all API endpoints.
 * Update the API_BASE_URL here and all requests will use the new URL.
 */

// The base URL for the Veo API
// Update this single URL when the API endpoint changes
export const VEO_API_BASE_URL =
  "https://veo-api-856765593724.us-central1.run.app";

// Construct full endpoint URLs
export const API_ENDPOINTS = {
  // Workflow endpoints
  workflows: {
    save: `${VEO_API_BASE_URL}/workflows/save`,
    list: (scope: string) => `${VEO_API_BASE_URL}/workflows?scope=${scope}`,
    get: (id: string) => `${VEO_API_BASE_URL}/workflows/${id}`,
    update: (id: string) => `${VEO_API_BASE_URL}/workflows/${id}`,
    delete: (id: string) => `${VEO_API_BASE_URL}/workflows/${id}`,
    clone: (id: string) => `${VEO_API_BASE_URL}/workflows/${id}/clone`,
  },

  // Generation endpoints
  generate: {
    image: `${VEO_API_BASE_URL}/generate/image`,
    video: `${VEO_API_BASE_URL}/generate/video`,
    videoStatus: `${VEO_API_BASE_URL}/generate/video/status`,
    text: `${VEO_API_BASE_URL}/generate/text`,
    upscale: `${VEO_API_BASE_URL}/generate/upscale`,
  },

  // Library endpoints
  library: {
    save: `${VEO_API_BASE_URL}/library/save`,
    list: (assetType?: string) =>
      assetType
        ? `${VEO_API_BASE_URL}/library?asset_type=${assetType}`
        : `${VEO_API_BASE_URL}/library`,
    get: (id: string) => `${VEO_API_BASE_URL}/library/${id}`,
    delete: (id: string) => `${VEO_API_BASE_URL}/library/${id}`,
  },
} as const;

/**
 * How to use:
 *
 * Instead of:
 *   fetch('https://veo-api-856765593724.us-central1.run.app/generate/image', ...)
 *
 * Use:
 *   import { API_ENDPOINTS } from '@/lib/api-config'
 *   fetch(API_ENDPOINTS.generate.image, ...)
 *
 * When the API URL needs to change, update VEO_API_BASE_URL above.
 * All requests will automatically use the new URL.
 */
