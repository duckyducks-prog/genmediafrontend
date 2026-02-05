#!/bin/bash
# =============================================================================
# Test production build locally using Vite preview (Fast)
# =============================================================================
#
# Usage: ./scripts/test-prod-build-preview.sh
#
# This script builds the production bundle and runs it locally using Vite's
# built-in preview server. This is faster than Docker and good for quick tests.
#
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing production build locally with Vite preview${NC}"
echo ""

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Warning: pnpm not found, using npm${NC}"
    NPM_CMD="npm"
else
    NPM_CMD="pnpm"
fi

# Build production bundle
echo -e "${BLUE}📦 Building production bundle...${NC}"
$NPM_CMD build

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo -e "${BLUE}🚀 Starting preview server on http://localhost:8080${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Run preview server
$NPM_CMD preview --port 8080
