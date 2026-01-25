#!/usr/bin/env python3
"""
Smoke test script for GenMedia API.

Tests key endpoints to verify the API is working before deployment.
Run with: uv run python scripts/smoke_test.py

Requires:
- FIREBASE_TEST_TOKEN environment variable (get from browser console while logged in)
- API_URL environment variable (defaults to production)

To get a Firebase token, run this in browser console while logged into the app:
  const user = await (await import('firebase/auth')).getAuth().currentUser;
  console.log(await user.getIdToken());
"""

import os
import sys
import time
import httpx
from typing import Optional

# Configuration
API_URL = os.getenv("API_URL", "https://veo-api-otfo2ctxma-uc.a.run.app")
TOKEN = os.getenv("FIREBASE_TEST_TOKEN", "")
TIMEOUT = 30.0

# Test results
passed = 0
failed = 0
skipped = 0


def get_headers():
    """Get auth headers."""
    if not TOKEN:
        return {}
    return {"Authorization": f"Bearer {TOKEN}"}


def test(name: str, condition: bool, message: str = ""):
    """Record test result."""
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name}: {message}")


def skip(name: str, reason: str):
    """Skip a test."""
    global skipped
    skipped += 1
    print(f"  ⊘ {name}: {reason}")


def test_health():
    """Test health endpoint."""
    print("\n🏥 Health Check")
    try:
        r = httpx.get(f"{API_URL}/health", timeout=TIMEOUT)
        test("GET /health returns 200", r.status_code == 200, f"status={r.status_code}")
        if r.status_code == 200:
            data = r.json()
            test("Response has status field", "status" in data, str(data))
    except Exception as e:
        test("Health endpoint reachable", False, str(e))


def test_image_generation():
    """Test image generation endpoint."""
    print("\n🖼️  Image Generation")
    if not TOKEN:
        skip("Image generation", "No FIREBASE_TEST_TOKEN")
        return

    try:
        r = httpx.post(
            f"{API_URL}/v1/generate/image",
            json={"prompt": "A simple red circle on white background"},
            headers=get_headers(),
            timeout=60.0,
        )
        test("POST /v1/generate/image returns 200", r.status_code == 200, f"status={r.status_code}, body={r.text[:200]}")
        if r.status_code == 200:
            data = r.json()
            test("Response has image data", "image" in data or "data" in data, str(data.keys()))
    except httpx.TimeoutException:
        test("Image generation completes", False, "Timeout after 60s")
    except Exception as e:
        test("Image generation works", False, str(e))


def test_video_generation():
    """Test video generation start endpoint."""
    print("\n🎬 Video Generation")
    if not TOKEN:
        skip("Video generation", "No FIREBASE_TEST_TOKEN")
        return

    try:
        r = httpx.post(
            f"{API_URL}/v1/generate/video",
            json={
                "prompt": "A simple animation of a bouncing ball",
                "duration_seconds": 4,
                "aspect_ratio": "16:9",
            },
            headers=get_headers(),
            timeout=60.0,
        )
        test("POST /v1/generate/video returns 200", r.status_code == 200, f"status={r.status_code}, body={r.text[:200]}")
        if r.status_code == 200:
            data = r.json()
            test("Response has operation_name", "operation_name" in data, str(data.keys()))
    except httpx.TimeoutException:
        test("Video generation starts", False, "Timeout after 60s")
    except Exception as e:
        test("Video generation works", False, str(e))


def test_workflows():
    """Test workflow CRUD operations."""
    print("\n📋 Workflows")
    if not TOKEN:
        skip("Workflow operations", "No FIREBASE_TEST_TOKEN")
        return

    workflow_id = None

    # List workflows
    try:
        r = httpx.get(
            f"{API_URL}/v1/workflows?scope=my",
            headers=get_headers(),
            timeout=TIMEOUT,
        )
        test("GET /v1/workflows?scope=my returns 200", r.status_code == 200, f"status={r.status_code}")
    except Exception as e:
        test("List workflows", False, str(e))

    # List public workflows
    try:
        r = httpx.get(
            f"{API_URL}/v1/workflows?scope=public",
            headers=get_headers(),
            timeout=TIMEOUT,
        )
        test("GET /v1/workflows?scope=public returns 200", r.status_code == 200, f"status={r.status_code}")
    except Exception as e:
        test("List public workflows", False, str(e))

    # Create workflow
    try:
        r = httpx.post(
            f"{API_URL}/v1/workflows",
            json={
                "name": "Smoke Test Workflow",
                "description": "Created by smoke test - safe to delete",
                "is_public": False,
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "prompt",
                        "position": {"x": 0, "y": 0},
                        "data": {"prompt": "test prompt"},
                    }
                ],
                "edges": [],
            },
            headers=get_headers(),
            timeout=TIMEOUT,
        )
        test("POST /v1/workflows creates workflow", r.status_code == 200, f"status={r.status_code}, body={r.text[:200]}")
        if r.status_code == 200:
            data = r.json()
            workflow_id = data.get("id")
            test("Response has workflow id", workflow_id is not None, str(data))
    except Exception as e:
        test("Create workflow", False, str(e))

    # Get workflow
    if workflow_id:
        try:
            r = httpx.get(
                f"{API_URL}/v1/workflows/{workflow_id}",
                headers=get_headers(),
                timeout=TIMEOUT,
            )
            test("GET /v1/workflows/{id} returns 200", r.status_code == 200, f"status={r.status_code}")
        except Exception as e:
            test("Get workflow", False, str(e))

        # Delete workflow (cleanup)
        try:
            r = httpx.delete(
                f"{API_URL}/v1/workflows/{workflow_id}",
                headers=get_headers(),
                timeout=TIMEOUT,
            )
            test("DELETE /v1/workflows/{id} returns 200", r.status_code == 200, f"status={r.status_code}")
        except Exception as e:
            test("Delete workflow", False, str(e))


def test_assets():
    """Test asset/library operations."""
    print("\n📁 Assets/Library")
    if not TOKEN:
        skip("Asset operations", "No FIREBASE_TEST_TOKEN")
        return

    # List assets
    try:
        r = httpx.get(
            f"{API_URL}/v1/assets",
            headers=get_headers(),
            timeout=TIMEOUT,
        )
        test("GET /v1/assets returns 200", r.status_code == 200, f"status={r.status_code}")
    except Exception as e:
        test("List assets", False, str(e))


def test_text_generation():
    """Test text generation endpoint."""
    print("\n💬 Text Generation")
    if not TOKEN:
        skip("Text generation", "No FIREBASE_TEST_TOKEN")
        return

    try:
        r = httpx.post(
            f"{API_URL}/v1/generate/text",
            json={"prompt": "Say hello in one word"},
            headers=get_headers(),
            timeout=30.0,
        )
        test("POST /v1/generate/text returns 200", r.status_code == 200, f"status={r.status_code}, body={r.text[:200]}")
        if r.status_code == 200:
            data = r.json()
            test("Response has text", "text" in data, str(data.keys()))
    except Exception as e:
        test("Text generation", False, str(e))


def main():
    """Run all smoke tests."""
    print("=" * 60)
    print("GenMedia API Smoke Tests")
    print("=" * 60)
    print(f"API URL: {API_URL}")
    print(f"Auth Token: {'✓ Set' if TOKEN else '✗ Not set (some tests will skip)'}")

    if not TOKEN:
        print("\n⚠️  To run authenticated tests, set FIREBASE_TEST_TOKEN:")
        print("   export FIREBASE_TEST_TOKEN='your-token-here'")

    # Run tests
    test_health()
    test_text_generation()
    test_image_generation()
    test_video_generation()
    test_workflows()
    test_assets()

    # Summary
    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    print("=" * 60)

    if failed > 0:
        print("\n❌ Some tests failed!")
        sys.exit(1)
    else:
        print("\n✅ All tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
