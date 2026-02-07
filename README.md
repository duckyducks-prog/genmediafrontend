# GenMedia Project

GenMedia is a full-stack AI-powered media generation platform. It features a FastAPI backend for content generation (images, video, text) and a modern React/Vite frontend. The project is designed for easy deployment to Google Cloud Run with robust dev/prod environment separation.

---

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development](#development)
- [Deployment](#deployment)
- [Environment Strategy](#environment-strategy)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Features
- AI-powered image, video, and text generation (Google Gemini & Veo)
- RESTful API backend (FastAPI)
- Modern React/Vite frontend
- Google Firebase authentication
- Environment-based config (dev/prod)
- Dockerized for local and cloud deployment
- One-command deploy scripts for both frontend and backend
- CORS and access control for secure environments

## Architecture
- **Backend:** FastAPI, Python 3.11+, Google Cloud, Firebase, Docker
- **Frontend:** React, Vite, TypeScript, Firebase Auth, Docker
- **Deployment:** Google Cloud Run, Cloud Build, Docker
## Quick Start 
### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker
- Google Cloud SDK
- Firebase project & service account

### Backend Setup
1. Copy and configure environment:
   ```bash
   cp backend/.env.example backend/.env.development
   # Edit backend/.env.development with your credentials
   ```
2. Install dependencies:
   ```bash
3. Run locally:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend Setup
1. Copy and configure environment:
   ```bash
   cp frontend/.env.local.example frontend/.env.local
   # Edit frontend/.env.local with your Firebase and API config
   ```
2. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Run locally:
   ```bash
   npm run dev
   ```

## Deployment
- **Backend:**
  ```bash
  cd backend
  ./scripts/deploy.sh
  ```
- **Frontend:**
  ./scripts/deploy.sh
  # Choose dev or prod when prompted

## Environment Strategy
- See [ENVIRONMENT_STRATEGY.md](ENVIRONMENT_STRATEGY.md) for details on dev/prod separation, CORS, and Firestore usage.

## Testing
- Frontend: `pnpm test` or `pnpm vitest`
- Backend: `pytest` (if tests are present)

## Troubleshooting
- See `BACKEND_TROUBLESHOOTING.md` and `DEVELOPMENT_GUIDE.md` for common issues.
- Please include clear commit messages and update documentation as needed.
---

For more, see the `docs/` folder and in-code comments.
