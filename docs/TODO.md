# GenMedia Frontend TODO

## Phase 1: Documentation & Technical Architecture
- [ ] **Architecture Diagram** - Document current vs proposed company infrastructure
  - Current: Leticia's GCP (Cloud Run frontend/backend, Firebase auth)
  - Proposed: compmany infrastructure (GCP account, auth strategy)
  - Include data flows, external dependencies, API integrations
- [ ] **Technical Requirements Documentation**
  - Video processing concerns & GPU requirements
  - Rate limiting implementation
  - Latency optimization opportunities
  - Spend control mechanisms

## Phase 2: Immediate Development Workflow (Priority)
- [x] **Frontend Deployment** - Test restructured code in Cloud Run ✅
- [ ] **Backend CORS Update** - Add frontend refactor URL to allowed origins
  ```
  https://genmedia-frontend-refactor-856765593724.us-central1.run.app
  ```
- [ ] **End-to-end Testing** - Verify all API calls work with deployed frontend
- [ ] **Firebase Console** - Add new domain to authorized domains ✅
- [ ] **Merge to Main** - Get clean base for continued development

## Phase 3: Code Quality & Organization
- [ ] **Frontend Refactor** + comprehensive testing
- [ ] **Backend Refactor** + comprehensive testing  
- [ ] **Tech Debt Resolution**:
  - Resolve conflicting deployment files
  - Standardize patterns across codebase
  - Add proper error handling
  - Address large bundle warning (1.5MB main chunk)
  - Review Firebase imports (mixed static/dynamic imports warning)

## Phase 4: Security & Deployment Strategy (company Compliance)
- [ ] **Repository Migration** - Move to company GitHub Enterprise
- [ ] **GCP Account Migration** - Move to company-owned GCP account
- [ ] **Environment Strategy Overhaul**:
  - Implement proper dev/staging/prod environment separation
  - Move secrets to GCP Secret Manager (or company standard)
  - Standardize environment variable naming across frontend/backend
  - Create environment-specific service accounts
  - Implement infrastructure as code (Terraform/Pulumi)
  - Add environment validation scripts
- [ ] **Secret Management** - Implement GCP Secret Manager
- [ ] **Authentication Migration** - Firebase → Okta with IAP
- [ ] **Security Hardening**:
  - Create new API keys for exposed secrets
  - Comprehensive security audit
  - Branch protection & CI/CD setup

## Phase 5: Performance & Production Readiness
- [ ] **Frontend Hosting Decision** - Firebase Hosting vs Cloud Run evaluation
- [ ] **Video Processing Optimization**:
  - NVIDIA GPU evaluation for video processing
  - Parallelize workflow nodes (currently sequential)  
  - Evaluate PIXI.js vs WebGL performance
- [ ] **Performance Optimization**:
  - Latency reduction opportunities
  - Fix script looping issues
  - Bundle size optimization

## Deployment Strategy Decision (Current)
- [ ] **Decision**: Cloud Run (current) vs Firebase Hosting for frontend
  - Current: Express server in Cloud Run container (working build ✅)
  - Alternative: Firebase Hosting for static React SPA (simpler, cheaper)
  - Note: Frontend server only does SPA serving + asset proxy routes - all video processing in Python backend
  - Question: Deploy current Cloud Run setup first to test E2E, or skip straight to Firebase Hosting migration?

## Immediate Technical Blockers
- [ ] Get environment variables/secrets from Leticia
- [ ] Test backend API connectivity with new frontend URL
- [ ] Resolve Firebase authentication domain issue ✅
