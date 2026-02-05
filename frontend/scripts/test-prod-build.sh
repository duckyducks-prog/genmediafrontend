#!/bin/bash
# =============================================================================
# Test production build locally using Docker (Full simulation)
# =============================================================================
#
# Usage: ./scripts/test-prod-build.sh
#
# This script builds the production Docker image and runs it locally.
# This closely simulates the actual production environment.
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing production build locally with Docker${NC}"
echo ""

# Load production environment variables
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production not found${NC}"
    echo "Create it from .env.example first"
    exit 1
fi

echo -e "${BLUE}Loading environment from .env.production${NC}"
export $(grep -v '^#' .env.production | grep -v '^$' | xargs)

# Check required variables
if [ -z "$VITE_FIREBASE_API_KEY" ]; then
    echo -e "${RED}Error: VITE_FIREBASE_API_KEY not set in .env.production${NC}"
    exit 1
fi

# Build Docker image
echo ""
echo -e "${BLUE}📦 Building Docker image...${NC}"
docker build -t genmedia-frontend-test \
  --build-arg VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY}" \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN}" \
  --build-arg VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID}" \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET}" \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
  --build-arg VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID}" \
  --build-arg VITE_FIREBASE_MEASUREMENT_ID="${VITE_FIREBASE_MEASUREMENT_ID}" \
  --build-arg "VITE_ALLOWED_EMAILS=${VITE_ALLOWED_EMAILS}" \
  .

# Stop and remove existing container if it exists
if docker ps -a | grep -q genmedia-test; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop genmedia-test 2>/dev/null || true
    docker rm genmedia-test 2>/dev/null || true
fi

# Run container with relaxed settings for local testing
echo ""
echo -e "${BLUE}🚀 Starting container on http://localhost:8080${NC}"
echo -e "${YELLOW}   (Using relaxed auth settings for easier testing)${NC}"
docker run -d -p 8080:8080 \
  --name genmedia-test \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e REQUIRE_AUTH=false \
  -e ALLOWED_ORIGINS="http://localhost:8080" \
  -e RATE_LIMIT_DISABLED=true \
  -e FIRESTORE_ENVIRONMENT=dev \
  genmedia-frontend-test

echo ""
echo -e "${GREEN}✅ Container started!${NC}"
echo ""
echo -e "${BLUE}🔗 Test at: http://localhost:8080${NC}"
echo -e "${BLUE}📋 Logs:    docker logs -f genmedia-test${NC}"
echo ""
echo -e "${YELLOW}To stop:${NC}"
echo "  docker stop genmedia-test && docker rm genmedia-test"
echo ""
