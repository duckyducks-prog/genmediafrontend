#!/bin/bash

# Quick E2E Test Runner
# This script helps you quickly run E2E tests with proper setup

set -e

echo "================================"
echo "E2E API Tests - Quick Runner"
echo "================================"
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
  exit 1
fi

echo "✅ Auth token found"
echo ""

# Parse arguments
TEST_FILTER=""
WATCH_MODE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --watch|-w)
      WATCH_MODE="--watch"
      shift
      ;;
    --filter|-t)
      TEST_FILTER="-t \"$2\""
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./quick-test.sh [options]"
      echo ""
      echo "Options:"
      echo "  -w, --watch         Run in watch mode"
      echo "  -t, --filter TEXT   Run tests matching TEXT"
      echo "  -h, --help          Show this help"
      echo ""
      echo "Examples:"
      echo "  ./quick-test.sh                          # Run all tests"
      echo "  ./quick-test.sh --watch                  # Run in watch mode"
      echo "  ./quick-test.sh -t \"Image Generation\"    # Run specific suite"
      echo ""
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Run tests
echo "Running E2E tests..."
echo ""

if [ -n "$WATCH_MODE" ]; then
  echo "Watch mode enabled - tests will re-run on file changes"
  echo ""
fi

eval npm test tests/e2e/api.e2e.spec.ts $TEST_FILTER $WATCH_MODE
