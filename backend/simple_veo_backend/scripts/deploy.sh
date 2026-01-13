#!/bin/bash
set -e

echo "🚀 Deploying GenMedia API..."

# Extract values from config.py using uv environment
PROJECT_ID=$(uv run python -c "from app.config import settings; print(settings.project_id)")
API_LOCATION=$(uv run python -c "from app.config import settings; print(settings.location)")
GCS_BUCKET=$(uv run python -c "from app.config import settings; print(settings.gcs_bucket)")
WORKFLOWS_BUCKET=$(uv run python -c "from app.config import settings; print(settings.workflows_bucket)")
FIREBASE_PROJECT_ID=$(uv run python -c "from app.config import settings; print(settings.firebase_project_id)")

# Load ALLOWED_EMAILS from .env file if it exists, or use environment variable
if [ -f .env ]; then
  source .env
fi
ALLOWED_EMAILS="${ALLOWED_EMAILS:-}"

if [ -z "$ALLOWED_EMAILS" ]; then
  echo "ℹ️  Note: ALLOWED_EMAILS is not set. All authenticated users will have access."
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
echo "  Allowed Emails: $ALLOWED_EMAILS"

# Create temporary env vars file (handles commas in ALLOWED_EMAILS properly)
ENV_VARS_FILE=$(mktemp)
cat > "$ENV_VARS_FILE" << EOF
PROJECT_ID: "$PROJECT_ID"
LOCATION: "$API_LOCATION"
GCS_BUCKET: "$GCS_BUCKET"
WORKFLOWS_BUCKET: "$WORKFLOWS_BUCKET"
FIREBASE_PROJECT_ID: "$FIREBASE_PROJECT_ID"
ALLOWED_EMAILS: "$ALLOWED_EMAILS"
EOF

# Clean up temp file on exit
trap "rm -f $ENV_VARS_FILE" EXIT

gcloud run deploy veo-api \
  --source . \
  --project="$PROJECT_ID" \
  --region="$CLOUD_RUN_REGION" \
  --allow-unauthenticated \
  --env-vars-file="$ENV_VARS_FILE" \
  --timeout=300 \
  --memory=1Gi

# Get the service URL dynamically
SERVICE_URL=$(gcloud run services describe veo-api --region="$CLOUD_RUN_REGION" --project="$PROJECT_ID" --format='value(status.url)')

echo "✅ Deployment complete!"
echo "🔗 $SERVICE_URL"