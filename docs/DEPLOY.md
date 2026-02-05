# Deploying to Google Cloud Run

This guide covers deploying the GenMedia Frontend to GCP Cloud Run.

## Prerequisites

1. **Google Cloud SDK** installed and configured
   ```bash
   # Install: https://cloud.google.com/sdk/docs/install
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Docker** installed (for local testing)
   ```bash
   # Verify installation
   docker --version
   ```

## Quick Deploy

```bash
# Set your Firebase config
export VITE_FIREBASE_API_KEY="your-api-key"
export VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
export VITE_FIREBASE_PROJECT_ID="your-project-id"
export VITE_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
export VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
export VITE_FIREBASE_APP_ID="1:123456789:web:abc123"

# Deploy
./deploy.sh
```

Or use an env file:
```bash
./deploy.sh --env-file .env.production
```

## Manual Deployment Steps

### 1. Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com
```

### 2. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create genmedia \
  --repository-format=docker \
  --location=us-central1
```

### 3. Grant Cloud Build Permissions

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Allow Cloud Build to deploy to Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# Allow Cloud Build to act as the compute service account
gcloud iam service-accounts add-iam-policy-binding \
  ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 4. Build and Deploy

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions="_VITE_FIREBASE_API_KEY=your-key,..."
```

## Local Testing with Docker

```bash
# Build the image
docker build -t genmedia-frontend \
  --build-arg VITE_FIREBASE_API_KEY="your-key" \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="your-domain" \
  --build-arg VITE_FIREBASE_PROJECT_ID="your-project" \
  .

# Run locally
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e REQUIRE_AUTH=false \
  genmedia-frontend

# Open http://localhost:8080
```

## Environment Variables

### Build-time (baked into bundle)

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase measurement ID |

### Runtime (Cloud Run env vars)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `NODE_ENV` | Environment | `production` |
| `REQUIRE_AUTH` | Enforce Firebase auth | `false` |

## Updating the Deployment

### Update environment variables
```bash
gcloud run services update genmedia-frontend \
  --region=us-central1 \
  --set-env-vars "REQUIRE_AUTH=true"
```

### Rollback to previous version
```bash
# List revisions
gcloud run revisions list --service=genmedia-frontend --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic genmedia-frontend \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

### View logs
```bash
gcloud run logs read --service=genmedia-frontend --region=us-central1 --limit=100
```

## Setting Up CI/CD with GitHub

1. Go to Cloud Build in GCP Console
2. Click "Triggers" → "Create Trigger"
3. Connect your GitHub repository
4. Configure:
   - Event: Push to branch
   - Branch: `^main$`
   - Config: `cloudbuild.yaml`
5. Add substitution variables for Firebase config

## Cost Optimization

- **Min instances = 0**: Scale to zero when not in use
- **Max instances = 10**: Prevent runaway costs
- **Memory = 512Mi**: Sufficient for Node.js app
- **CPU = 1**: Single CPU is enough for this workload

## Troubleshooting

### Build fails with "permission denied"
```bash
# Re-grant Cloud Build permissions
./deploy.sh  # Will automatically enable APIs
```

### Container crashes on startup
```bash
# Check logs
gcloud run logs read --service=genmedia-frontend --region=us-central1

# Common issues:
# - Missing environment variables
# - Port not matching (must use $PORT)
```

### Firebase auth not working
- Ensure `VITE_FIREBASE_*` vars are set at build time
- Check browser console for Firebase errors
- Verify Firebase project settings allow your Cloud Run domain

## Security Checklist

- [ ] Enable `REQUIRE_AUTH=true` for production
- [ ] Set up Cloud Run authentication if needed
- [ ] Configure Firebase security rules
- [ ] Enable Cloud Armor for DDoS protection (optional)
- [ ] Set up VPC connector for private resources (optional)
