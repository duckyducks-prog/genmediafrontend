#!/bin/bash
set -e

echo "🚀 Deploying GenMedia Frontend..."

# Configuration
PROJECT_ID="genmediastudio"
REGION="us-central1"

# Ask for environment
echo "Select deployment environment:"
echo "1) Development"
echo "2) Production"
read -p "Choose environment (1 or 2): " env_choice

case $env_choice in
  1)
    ENVIRONMENT="dev"
    SERVICE_NAME="genmedia-frontend-dev"
    ENV_FILE=".env.development"
    ;;
  2)
    ENVIRONMENT="prod"
    SERVICE_NAME="genmedia-frontend"
    ENV_FILE=".env.production"
    echo "⚠️  WARNING: This will deploy to PRODUCTION"
    read -p "Confirm production deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
      echo "Deployment cancelled"
      exit 0
    fi
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

# Load environment-specific variables
if [ -f "$ENV_FILE" ]; then
  echo "Loading environment variables from $ENV_FILE..."
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "❌ $ENV_FILE file not found!"
  exit 1
fi

echo "📋 Deployment config:"
echo "  Environment: $ENVIRONMENT"
echo "  Service Name: $SERVICE_NAME"
echo "  API Base URL: $VITE_API_BASE_URL"
echo "  Firebase Project ID: $VITE_FIREBASE_PROJECT_ID"
echo "  Firebase Auth Domain: $VITE_FIREBASE_AUTH_DOMAIN"

# Deploy with Cloud Build
gcloud builds submit --config cloudbuild.yaml \
  --project="$PROJECT_ID" \
  --substitutions="\
_SERVICE_NAME=$SERVICE_NAME,\
_VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY,\
_VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN,\
_VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID,\
_VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET,\
_VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID,\
_VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID,\
_VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID,\
_VITE_API_BASE_URL=$VITE_API_BASE_URL"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)' 2>/dev/null || echo "")

echo "✅ Deployment complete!"
if [ -n "$SERVICE_URL" ]; then
  echo "🔗 $SERVICE_URL"
else
  echo "⚠️  Could not retrieve service URL. Check Cloud Run console."
  echo "🔗 Expected URL: https://$SERVICE_NAME-*.run.app"
fi