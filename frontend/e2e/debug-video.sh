#!/bin/bash

# Video Generation Debug Script
# Runs the detailed video generation test with full logging

set -e

echo "=================================="
echo "Video Generation Debug Test"
echo "=================================="
echo ""

# Check if token is set
if [ -z "$FIREBASE_TEST_TOKEN" ]; then
  echo "❌ FIREBASE_TEST_TOKEN not set"
  echo ""
  echo "To get a token:"
  echo "1. Sign in to the app in a browser"
  echo "2. Open DevTools Console (F12)"
  echo "3. Run: await firebase.auth().currentUser.getIdToken()"
  echo "4. Copy the token and run:"
  echo ""
  echo "   export FIREBASE_TEST_TOKEN=\"<your-token>\""
  echo ""
  echo "Then run this script again"
  exit 1
fi

echo "✅ Auth token found"
echo ""
echo "This test will:"
echo "  1. Start a video generation request"
echo "  2. Poll the status endpoint every 10 seconds"
echo "  3. Log ALL API responses in detail"
echo "  4. Help identify why video data isn't being returned"
echo ""
echo "This may take up to 10 minutes. Press Ctrl+C to cancel."
echo ""
read -p "Press Enter to start the debug test..."
echo ""

# Run the debug test
npm test tests/e2e/video-debug.spec.ts
