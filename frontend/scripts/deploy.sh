#!/bin/bash
set -e

echo "🚀 Deploying GenMedia Frontend..."

# Ask for environment
echo "Select deployment environment:"
echo "1) Development"
echo "2) Production"
read -p "Choose environment (1 or 2): " env_choice

case $env_choice in
  1)
    ENVIRONMENT="dev"
    SERVICE_NAME="genmedia-frontend-dev"
    API_BASE_URL="https://veo-api-dev-otfo2ctxma-uc.a.run.app"
    ;;
  2)
    ENVIRONMENT="prod"
    SERVICE_NAME="genmedia-frontend"
    API_BASE_URL="https://veo-api-otfo2ctxma-uc.a.run.app"
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

# Load environment variables from .env.local
if [ -f .env.local ]; then
  echo "Loading environment variables from .env.local..."
  set -a
  source .env.local
  set +a
else
  echo "⚠️  .env.local file not found! Firebase config and other env vars may be missing."
fi

echo "📋 Deployment config:"
echo "  Environment: $ENVIRONMENT"
echo "  Service Name: $SERVICE_NAME"
echo "  API Base URL: $API_BASE_URL"
echo "  Firebase Project ID: $VITE_FIREBASE_PROJECT_ID"
echo "  Firebase Auth Domain: $VITE_FIREBASE_AUTH_DOMAIN"
echo "  Firebase Storage Bucket: $VITE_FIREBASE_STORAGE_BUCKET"
echo "  Firebase Messaging Sender ID: $VITE_FIREBASE_MESSAGING_SENDER_ID"
echo "  Firebase App ID: $VITE_FIREBASE_APP_ID"
echo "  Firebase Measurement ID: $VITE_FIREBASE_MEASUREMENT_ID"

# Deploy with Cloud Build
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_SERVICE_NAME="$SERVICE_NAME",_VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY",_VITE_FIREBASE_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN",_VITE_FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID",_VITE_FIREBASE_STORAGE_BUCKET="$VITE_FIREBASE_STORAGE_BUCKET",_VITE_FIREBASE_MESSAGING_SENDER_ID="$VITE_FIREBASE_MESSAGING_SENDER_ID",_VITE_FIREBASE_APP_ID="$VITE_FIREBASE_APP_ID",_VITE_FIREBASE_MEASUREMENT_ID="$VITE_FIREBASE_MEASUREMENT_ID",_VITE_API_BASE_URL="$API_BASE_URL"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="us-central1" --project="genmediastudio" --format='value(status.url)' 2>/dev/null || echo "")

echo "✅ Deployment complete!"
if [ -n "$SERVICE_URL" ]; then
  echo "🔗 $SERVICE_URL"
else
  echo "🔗 Service should be available at: https://$SERVICE_NAME-*.run.app"
fi
