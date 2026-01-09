#!/bin/bash
# =============================================================================
# Cloud Run Deployment Script
# =============================================================================
#
# Usage:
#   ./deploy.sh                    # Deploy with default settings
#   ./deploy.sh --project my-proj  # Deploy to specific project
#   ./deploy.sh --env-file .env    # Load env vars from file
#
# =============================================================================

set -e

# Default configuration
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-genmedia-frontend}"
REPOSITORY="${REPOSITORY:-genmedia}"
REQUIRE_AUTH="${REQUIRE_AUTH:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --service)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --env-file)
      if [[ -f "$2" ]]; then
        echo -e "${YELLOW}Loading environment from $2${NC}"
        export $(grep -v '^#' "$2" | xargs)
      else
        echo -e "${RED}Error: Env file $2 not found${NC}"
        exit 1
      fi
      shift 2
      ;;
    --require-auth)
      REQUIRE_AUTH="true"
      shift
      ;;
    --help)
      echo "Usage: ./deploy.sh [options]"
      echo ""
      echo "Options:"
      echo "  --project PROJECT_ID    GCP project ID"
      echo "  --region REGION         GCP region (default: us-central1)"
      echo "  --service NAME          Cloud Run service name (default: genmedia-frontend)"
      echo "  --env-file FILE         Load environment variables from file"
      echo "  --require-auth          Enable authentication in production"
      echo "  --help                  Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Get project ID if not set
if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
  if [[ -z "$PROJECT_ID" ]]; then
    echo -e "${RED}Error: No project ID specified and no default project set${NC}"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
  fi
fi

echo -e "${GREEN}=== Cloud Run Deployment ===${NC}"
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo "Auth:     $REQUIRE_AUTH"
echo ""

# Check required Firebase env vars
REQUIRED_VARS=(
  "VITE_FIREBASE_API_KEY"
  "VITE_FIREBASE_AUTH_DOMAIN"
  "VITE_FIREBASE_PROJECT_ID"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var}" ]]; then
    MISSING_VARS+=("$var")
  fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  echo -e "${YELLOW}Warning: Missing Firebase environment variables:${NC}"
  printf '  - %s\n' "${MISSING_VARS[@]}"
  echo ""
  echo "Set them in your environment or use --env-file .env"
  echo "The build will continue but Firebase features may not work."
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# Create Artifact Registry repository if it doesn't exist
echo -e "${YELLOW}Ensuring Artifact Registry repository exists...${NC}"
gcloud artifacts repositories describe "$REPOSITORY" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID"

# Get git commit SHA for image tagging
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
echo "Image tag: $SHORT_SHA"

# Build and deploy using Cloud Build
echo -e "${YELLOW}Starting Cloud Build...${NC}"
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project="$PROJECT_ID" \
  --substitutions="\
SHORT_SHA=$SHORT_SHA,\
_REGION=$REGION,\
_SERVICE_NAME=$SERVICE_NAME,\
_REPOSITORY=$REPOSITORY,\
_REQUIRE_AUTH=$REQUIRE_AUTH,\
_VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY:-},\
_VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN:-},\
_VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID:-},\
_VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET:-},\
_VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID:-},\
_VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID:-},\
_VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID:-}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "Service URL: ${GREEN}$SERVICE_URL${NC}"
echo ""
echo "To view logs:"
echo "  gcloud run logs read --service=$SERVICE_NAME --region=$REGION"
echo ""
echo "To update environment variables:"
echo "  gcloud run services update $SERVICE_NAME --region=$REGION --set-env-vars KEY=VALUE"
