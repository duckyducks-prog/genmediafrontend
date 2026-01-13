#!/bin/bash
# =============================================================================
# Deploy script for Cloud Run
# =============================================================================
# Usage: ./scripts/deploy.sh
#
# Required environment variables (or set in .env.production):
#   VITE_FIREBASE_API_KEY
#   VITE_FIREBASE_AUTH_DOMAIN
#   VITE_FIREBASE_PROJECT_ID
#   VITE_FIREBASE_STORAGE_BUCKET
#   VITE_FIREBASE_MESSAGING_SENDER_ID
#   VITE_FIREBASE_APP_ID
#   VITE_FIREBASE_MEASUREMENT_ID
#   GCP_PROJECT_ID
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GenMedia Frontend Deployment ===${NC}"

# Load environment variables from .env.production, .env.local, or .env if they exist
if [ -f .env.production ]; then
    echo -e "${YELLOW}Loading environment from .env.production${NC}"
    export $(grep -v '^#' .env.production | xargs)
elif [ -f .env.local ]; then
    echo -e "${YELLOW}Loading environment from .env.local${NC}"
    export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
    echo -e "${YELLOW}Loading environment from .env${NC}"
    export $(grep -v '^#' .env | xargs)
fi

# Check for required GCP project
if [ -z "$GCP_PROJECT_ID" ]; then
    # Try to get from gcloud config
    GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$GCP_PROJECT_ID" ]; then
        echo -e "${RED}Error: GCP_PROJECT_ID not set and no default project configured${NC}"
        echo "Set it with: export GCP_PROJECT_ID=your-project-id"
        echo "Or run: gcloud config set project your-project-id"
        exit 1
    fi
fi

echo -e "${GREEN}Deploying to project: ${GCP_PROJECT_ID}${NC}"

# Build substitutions string
SUBSTITUTIONS="_REQUIRE_AUTH=true"

# Add Firebase config if available
[ -n "$VITE_FIREBASE_API_KEY" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}"
[ -n "$VITE_FIREBASE_AUTH_DOMAIN" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}"
[ -n "$VITE_FIREBASE_PROJECT_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}"
[ -n "$VITE_FIREBASE_STORAGE_BUCKET" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}"
[ -n "$VITE_FIREBASE_MESSAGING_SENDER_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}"
[ -n "$VITE_FIREBASE_APP_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}"
[ -n "$VITE_FIREBASE_MEASUREMENT_ID" ] && SUBSTITUTIONS="${SUBSTITUTIONS},_VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}"

echo -e "${YELLOW}Starting Cloud Build...${NC}"

# Submit build to Cloud Build
gcloud builds submit \
    --project="${GCP_PROJECT_ID}" \
    --config=cloudbuild.yaml \
    --substitutions="${SUBSTITUTIONS}"

echo -e "${GREEN}=== Deployment complete! ===${NC}"
echo -e "View your app at: https://genmedia-frontend-*.run.app"
echo -e "Check logs: gcloud run logs read --project=${GCP_PROJECT_ID} genmedia-frontend"
