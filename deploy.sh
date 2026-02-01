#!/bin/bash
# =============================================================================
# Deploy script for Cloud Run
# =============================================================================
#
# Usage: ./deploy.sh
#
# This script reads environment variables from (in order of priority):
#   1. .env.production
#   2. .env.local
#   3. .env
#
# Required variables:
#   - VITE_FIREBASE_API_KEY (for frontend Firebase auth)
#   - GCP_PROJECT_ID (or set via gcloud config)
#
# See .env.example for all available variables.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GenMedia Frontend Deployment ===${NC}"
echo ""

# -----------------------------------------------------------------------------
# Load environment variables
# -----------------------------------------------------------------------------
ENV_FILE=""
if [ -f .env.production ]; then
    ENV_FILE=".env.production"
elif [ -f .env.local ]; then
    ENV_FILE=".env.local"
elif [ -f .env ]; then
    ENV_FILE=".env"
fi

if [ -n "$ENV_FILE" ]; then
    echo -e "${BLUE}Loading environment from: ${ENV_FILE}${NC}"
    export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
else
    echo -e "${YELLOW}Warning: No .env file found. Using existing environment variables.${NC}"
    echo -e "${YELLOW}Create .env.production from .env.example for production deployments.${NC}"
fi

# -----------------------------------------------------------------------------
# Validate GCP Project
# -----------------------------------------------------------------------------
if [ -z "$GCP_PROJECT_ID" ]; then
    GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$GCP_PROJECT_ID" ]; then
        echo -e "${RED}Error: GCP_PROJECT_ID not set${NC}"
        echo "Set it in your .env file or run: gcloud config set project your-project-id"
        exit 1
    fi
fi

# -----------------------------------------------------------------------------
# Validate Firebase Configuration
# -----------------------------------------------------------------------------
echo ""
echo -e "${BLUE}Firebase Configuration:${NC}"
if [ -n "$VITE_FIREBASE_API_KEY" ]; then
    echo -e "  API Key:      ${GREEN}[SET]${NC} (${VITE_FIREBASE_API_KEY:0:10}...)"
else
    echo -e "  API Key:      ${RED}[MISSING]${NC}"
fi
echo -e "  Auth Domain:  ${VITE_FIREBASE_AUTH_DOMAIN:-${RED}[MISSING]${NC}}"
echo -e "  Project ID:   ${VITE_FIREBASE_PROJECT_ID:-${RED}[MISSING]${NC}}"
echo -e "  Storage:      ${VITE_FIREBASE_STORAGE_BUCKET:-${RED}[MISSING]${NC}}"
echo -e "  App ID:       ${VITE_FIREBASE_APP_ID:+${GREEN}[SET]${NC}}${VITE_FIREBASE_APP_ID:-${RED}[MISSING]${NC}}"
echo ""

# Check if API key is set (required)
if [ -z "$VITE_FIREBASE_API_KEY" ]; then
    echo -e "${RED}Error: VITE_FIREBASE_API_KEY is required${NC}"
    echo "Add it to your .env.production file or export it:"
    echo "  export VITE_FIREBASE_API_KEY=your-api-key"
    exit 1
fi

# -----------------------------------------------------------------------------
# Build Configuration
# -----------------------------------------------------------------------------
echo -e "${BLUE}Deployment Configuration:${NC}"
echo -e "  GCP Project:  ${GCP_PROJECT_ID}"
echo -e "  REQUIRE_AUTH: ${GREEN}true${NC} (always enabled for production)"
echo ""

# -----------------------------------------------------------------------------
# Build substitutions for Cloud Build
# -----------------------------------------------------------------------------
SUBSTITUTIONS="_REQUIRE_AUTH=true"

# Add Firebase config
[ -n "$VITE_FIREBASE_API_KEY" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}"
[ -n "$VITE_FIREBASE_AUTH_DOMAIN" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}"
[ -n "$VITE_FIREBASE_PROJECT_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}"
[ -n "$VITE_FIREBASE_STORAGE_BUCKET" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}"
[ -n "$VITE_FIREBASE_MESSAGING_SENDER_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}"
[ -n "$VITE_FIREBASE_APP_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}"
[ -n "$VITE_FIREBASE_MEASUREMENT_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}"
# Escape commas in ALLOWED_EMAILS (replace , with ;;) - will be unescaped in cloudbuild.yaml
if [ -n "$VITE_ALLOWED_EMAILS" ]; then
    ESCAPED_EMAILS=$(echo "$VITE_ALLOWED_EMAILS" | sed 's/,/;;/g')
    SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_ALLOWED_EMAILS=${ESCAPED_EMAILS}"
fi
# Escape commas in ALLOWED_ORIGINS (replace , with ;;) - will be unescaped in cloudbuild.yaml
if [ -n "$ALLOWED_ORIGINS" ]; then
    ESCAPED_ORIGINS=$(echo "$ALLOWED_ORIGINS" | sed 's/,/;;/g')
    SUBSTITUTIONS="${SUBSTITUTIONS},_ALLOWED_ORIGINS=${ESCAPED_ORIGINS}"
fi

# -----------------------------------------------------------------------------
# Deploy
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Starting Cloud Build...${NC}"
echo ""

gcloud builds submit \
    --project="${GCP_PROJECT_ID}" \
    --config=cloudbuild.yaml \
    --substitutions="${SUBSTITUTIONS}"

echo ""
echo -e "${GREEN}=== Deployment complete! ===${NC}"
echo ""
echo -e "App URL:  https://genmedia-frontend-otfo2ctxma-uc.a.run.app"
echo -e "Logs:     gcloud run logs read --project=${GCP_PROJECT_ID} genmedia-frontend"
echo ""
