# End-to-End API Tests

This directory contains comprehensive end-to-end tests that verify all backend API functionality.

## Overview

The E2E tests make real HTTP requests to the backend API at:
- `https://veo-api-82187245577.us-central1.run.app`

These tests verify:
- ✅ Image generation
- ✅ Image upscaling
- ✅ Video generation
- ✅ Video status polling
- ✅ Text generation (LLM)
- ✅ Library operations (save, list, delete)
- ✅ Error handling and edge cases
- ✅ Full integration workflows

## Setup

### Prerequisites

1. **Firebase Authentication Token**

   The tests require a valid Firebase ID token to authenticate with the backend.

   **Option A: Manual token (recommended for local testing)**
   ```bash
   # 1. Sign in to the app in a browser
   # 2. Open DevTools Console (F12)
   # 3. Run this command:
   await firebase.auth().currentUser.getIdToken()
   
   # 4. Copy the token and export it:
   export FIREBASE_TEST_TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ..."
   ```

   **Option B: Use test credentials (if available)**
   ```bash
   export FIREBASE_TEST_EMAIL="test@example.com"
   export FIREBASE_TEST_PASSWORD="test-password"
   ```

2. **Install Dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

## Running Tests

### Run All E2E Tests
```bash
npm test tests/e2e/api.e2e.spec.ts
```

### Run Specific Test Suite
```bash
npm test tests/e2e/api.e2e.spec.ts -t "Image Generation"
```

### Run Single Test
```bash
npm test tests/e2e/api.e2e.spec.ts -t "should generate an image"
```

### Watch Mode (auto-rerun on changes)
```bash
npm test tests/e2e/api.e2e.spec.ts --watch
```

### Run with Verbose Output
```bash
npm test tests/e2e/api.e2e.spec.ts -- --reporter=verbose
```

## Test Structure

### Test Suites

1. **Health Check**
   - Verifies the API root endpoint responds

2. **Image Generation**
   - Generate images from text prompts
   - Test different aspect ratios (1:1, 16:9, 9:16)
   - Error handling (missing auth, invalid params)

3. **Image Upscaling**
   - Upscale generated images
   - Test different upscale factors (2x, 4x)

4. **Video Generation**
   - Generate videos from text prompts
   - Handle async operation names

5. **Video Status Polling**
   - Check status of video generation operations
   - Handle pending/complete/failed states

6. **Text Generation (LLM)**
   - Generate text from prompts
   - Test system prompts
   - Test temperature variations

7. **Library Operations**
   - Save assets to library
   - Retrieve library listing
   - Delete assets from library

8. **Error Handling**
   - Unauthorized access (403)
   - Missing parameters (400)
   - Invalid input validation

9. **Integration Workflows**
   - Full workflow: generate → upscale → save to library
   - Tests end-to-end user scenarios

### Test Lifecycle

```
beforeAll (global)
  ├─ Get auth token from environment
  ├─ Verify token works
  └─ Ready to run tests

tests run...
  ├─ Each test makes real API calls
  ├─ Generated assets tracked for cleanup
  └─ Test results logged

afterAll (global)
  └─ Delete all test assets from library
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_TEST_TOKEN` | Yes* | Firebase ID token for authentication |
| `FIREBASE_TEST_EMAIL` | No | Test user email (alternative auth) |
| `FIREBASE_TEST_PASSWORD` | No | Test user password (alternative auth) |

*At least one auth method must be provided

## Expected Results

### Successful Test Run

```
✓ Auth token configured
✓ Auth token verified

 ✓ tests/e2e/api.e2e.spec.ts (25)
   ✓ API E2E Tests (24)
     ✓ Health Check (1)
       ✓ should respond to GET /
     ✓ Image Generation (3)
       ✓ should generate an image from a text prompt
       ✓ should reject requests without auth token
       ✓ should handle different aspect ratios
     ✓ Image Upscaling (2)
       ✓ should upscale an image
       ✓ should handle different upscale factors
     ✓ Video Generation (1)
       ✓ should generate a video from a text prompt
     ✓ Video Status Polling (1)
       ✓ should check video generation status
     ✓ Text Generation (LLM) (3)
       ✓ should generate text from a prompt
       ✓ should use system prompt if provided
       ✓ should handle different temperature values
     ✓ Library Operations (3)
       ✓ should save an asset to the library
       ✓ should retrieve library assets
       ✓ should delete an asset from the library
     ✓ Error Handling (3)
       ✓ should return 403 for unauthorized users
       ✓ should handle missing required parameters
       ✓ should handle invalid aspect ratio
     ✓ Integration Workflows (1)
       ✓ should complete a full workflow: generate → upscale → save to library

Cleaning up 2 test assets...
✓ Deleted image asset abc123
✓ Deleted image asset def456

Test Files  1 passed (1)
     Tests  25 passed (25)
```

## Timeouts

- Default test timeout: **2 minutes** (120,000ms)
- Full workflow tests: **4 minutes** (240,000ms)

Video and image generation can take time, so timeouts are generous.

## Cleanup

The test suite automatically cleans up after itself:
- Tracks all generated assets during test runs
- Deletes them from the library in `afterAll` hook
- Ensures no test data pollution

## Troubleshooting

### "No FIREBASE_TEST_TOKEN found"
```
⚠️  WARNING: No FIREBASE_TEST_TOKEN found in environment
```
**Solution:** Set the environment variable as described in Setup section.

### "Token verification failed"
```
✗ Token verification failed: Token is valid but user is not whitelisted
```
**Solution:** Make sure your test user's email is in the backend whitelist.

### "Timeout of 120000ms exceeded"
```
Error: Timeout of 120000ms exceeded
```
**Solution:** 
- Backend might be slow or down
- Increase timeout in test file
- Check if backend API is running

### Tests fail with 403 errors
```
Expected 200, received 403
```
**Solution:**
- Token might have expired (get a fresh one)
- User email not whitelisted on backend
- Backend authentication configuration issue

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run E2E tests
        env:
          FIREBASE_TEST_TOKEN: ${{ secrets.FIREBASE_TEST_TOKEN }}
        run: npm test tests/e2e/api.e2e.spec.ts
```

### Store Token as Secret

In GitHub:
1. Go to Settings → Secrets and variables → Actions
2. Add new secret: `FIREBASE_TEST_TOKEN`
3. Paste your Firebase ID token
4. Tests will use it automatically

## Best Practices

1. **Token Management**
   - Keep tokens secret (don't commit to git)
   - Rotate tokens periodically
   - Use different tokens for dev/staging/prod

2. **Test Isolation**
   - Each test should be independent
   - Don't rely on test execution order
   - Clean up generated data

3. **Error Handling**
   - Tests should handle async failures gracefully
   - Log useful debugging information
   - Check for specific error codes

4. **Performance**
   - Use beforeAll for expensive setup
   - Reuse generated assets when possible
   - Run tests in parallel when safe

## Extending Tests

### Add a New Test

```typescript
it('should do something new', async () => {
  if (!authToken) return; // Skip if no token

  const response = await apiRequest('/some/endpoint', {
    method: 'POST',
    body: JSON.stringify({
      param: 'value',
    }),
  });

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.result).toBeDefined();
  
  console.log('✓ Did something new');
}, TEST_TIMEOUT);
```

### Add Cleanup for New Asset Types

```typescript
afterAll(async () => {
  // Custom cleanup logic
  for (const asset of testAssets) {
    if (asset.type === 'my-custom-type') {
      await apiRequest(`/my-endpoint/${asset.id}`, {
        method: 'DELETE',
      });
    }
  }
}, TEST_TIMEOUT);
```

## Support

If tests fail unexpectedly:
1. Check backend API status
2. Verify auth token is valid
3. Check network connectivity
4. Review backend logs
5. Report issues with test output logs
