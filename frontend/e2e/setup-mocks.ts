/**
 * Mock Setup for Tests
 * Automatically sets up API and auth mocks when VITE_MOCK_API=true
 */

import { beforeAll, afterAll } from 'vitest';
import { setupApiMocks, setupAuthMocks } from './mocks';

// Set up mocks before all tests
beforeAll(() => {
  console.log('🎭 Setting up API and Auth mocks for testing...');
  
  // Set up API mocks
  setupApiMocks();
  
  // Set up Firebase auth mocks
  setupAuthMocks();
  
  console.log('✅ Mocks configured successfully');
});

// Clean up after all tests
afterAll(() => {
  console.log('🧹 Cleaning up test mocks...');
});