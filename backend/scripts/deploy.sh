#!/bin/bash
set -e

echo "🚀 Deploying GenMedia API..."

# Extract values from config.py using uv environment
PROJECT_ID=$(uv run python -c "from app.config import settings; print(settings.project_id)")
API_LOCATION=$(uv run python -c "from app.config import settings; print(settings.location)")
GCS_BUCKET=$(uv run python -c "from app.config import settings; print(settings.gcs_bucket)")
WORKFLOWS_BUCKET=$(uv run python -c "from app.config import settings; print(settings.workflows_bucket)")
FIREBASE_PROJECT_ID=$(uv run python -c "from app.config import settings; print(settings.firebase_project_id)")

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  set -a  # Auto-export all variables
  source .env
  set +a
fi
ALLOWED_EMAILS="${ALLOWED_EMAILS:-}"
ALLOWED_DOMAINS="${ALLOWED_DOMAINS:-}"
ADMIN_EMAILS="${ADMIN_EMAILS:-}"
ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-}"

if [ -z "$ALLOWED_EMAILS" ] && [ -z "$ALLOWED_DOMAINS" ]; then
  echo "ℹ️  Note: No access restrictions set. All authenticated users will have access."
fi

# Cloud Run region (separate from API location - Cloud Run doesn't support "global")
CLOUD_RUN_REGION="us-central1"

echo "📋 Deployment config:"
echo "  Project ID: $PROJECT_ID"
echo "  Cloud Run Region: $CLOUD_RUN_REGION"
echo "  API Location: $API_LOCATION"
echo "  GCS Bucket: $GCS_BUCKET"
echo "  Workflows Bucket: $WORKFLOWS_BUCKET"
echo "  Firebase Project: $FIREBASE_PROJECT_ID"
echo "  Allowed Domains: $ALLOWED_DOMAINS"
echo "  Allowed Emails: $ALLOWED_EMAILS"
echo "  Admin Emails: $ADMIN_EMAILS"

# Create temporary env vars file (handles commas properly)
ENV_VARS_FILE=$(mktemp)
cat > "$ENV_VARS_FILE" << EOF
PROJECT_ID: "$PROJECT_ID"
LOCATION: "$API_LOCATION"
GCS_BUCKET: "$GCS_BUCKET"
WORKFLOWS_BUCKET: "$WORKFLOWS_BUCKET"
FIREBASE_PROJECT_ID: "$FIREBASE_PROJECT_ID"
ALLOWED_DOMAINS: "$ALLOWED_DOMAINS"
ALLOWED_EMAILS: "$ALLOWED_EMAILS"
ADMIN_EMAILS: "$ADMIN_EMAILS"
ELEVENLABS_API_KEY: "$ELEVENLABS_API_KEY"
EOF

# Clean up temp file on exit
trap "rm -f $ENV_VARS_FILE" EXIT

gcloud run deploy veo-api \
  --source . \
  --project="$PROJECT_ID" \
  --region="$CLOUD_RUN_REGION" \
  --allow-unauthenticated \
  --ingress=all \
  --env-vars-file="$ENV_VARS_FILE" \
  --timeout=300 \
  --memory=2Gi \
  --cpu=2

# Get the service URL dynamically
SERVICE_URL=$(gcloud run services describe veo-api --region="$CLOUD_RUN_REGION" --project="$PROJECT_ID" --format='value(status.url)')

echo "✅ Deployment complete!"
echo "🔗 $SERVICE_URL"