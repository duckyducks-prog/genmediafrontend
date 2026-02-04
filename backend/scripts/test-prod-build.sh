#!/bin/bash
# =============================================================================
# Test production backend build locally using Docker
# =============================================================================
#
# Usage: ./backend/scripts/test-prod-build.sh
#
# This script builds the backend Docker image and runs it locally with
# production configuration.
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing backend production build locally with Docker${NC}"
echo ""

# Check if we're in the backend directory
if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}Error: Dockerfile not found${NC}"
    echo "Run this script from the backend directory"
    exit 1
fi

# Load production environment variables
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}Warning: .env.production not found, using .env${NC}"
    ENV_FILE=".env"
else
    ENV_FILE=".env.production"
fi

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: No environment file found${NC}"
    exit 1
fi

echo -e "${BLUE}Loading environment from ${ENV_FILE}${NC}"

# Build Docker image
echo ""
echo -e "${BLUE}📦 Building Docker image...${NC}"
docker build -t veo-api-test .

# Stop and remove existing container if it exists
if docker ps -a | grep -q veo-api-test; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop veo-api-test 2>/dev/null || true
    docker rm veo-api-test 2>/dev/null || true
fi

# Run container
echo ""
echo -e "${BLUE}🚀 Starting container on http://localhost:8000${NC}"
docker run -d -p 8000:8080 \
  --name veo-api-test \
  --env-file "$ENV_FILE" \
  -e PORT=8080 \
  veo-api-test

echo ""
echo -e "${GREEN}✅ Container started!${NC}"
echo ""
echo -e "${BLUE}🔗 Test at: http://localhost:8000/health${NC}"
echo -e "${BLUE}📋 Logs:    docker logs -f veo-api-test${NC}"
echo ""
echo -e "${YELLOW}To stop:${NC}"
echo "  docker stop veo-api-test && docker rm veo-api-test"
echo ""
