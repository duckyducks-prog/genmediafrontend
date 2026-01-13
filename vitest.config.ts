import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.test before running tests
dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    env: {
      // Load test environment variables
      ...process.env,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
