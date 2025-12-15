# Backend Workflow API Troubleshooting Guide

## Problem: Frontend Getting 404 Errors on Workflow Save

The frontend is making calls to:
```
POST https://veo-api-82187245577.us-central1.run.app/workflows/save
GET  https://veo-api-82187245577.us-central1.run.app/workflows?scope=my
GET  https://veo-api-82187245577.us-central1.run.app/workflows?scope=public
```

If these return 404, follow this checklist.

---

## Checklist 1: Verify Router is Mounted Correctly

### Check Your main.py or app.py

The router MUST be mounted with the `/workflows` prefix:

```python
from fastapi import FastAPI
from app.routes import workflow  # Your router module

app = FastAPI()

# ✅ CORRECT - Router mounted at /workflows
app.include_router(
    workflow.router,
    prefix="/workflows",  # ← Must be exactly "/workflows"
    tags=["workflows"]
)

# ❌ WRONG - Missing prefix
app.include_router(workflow.router)  # This won't work!

# ❌ WRONG - Wrong prefix
app.include_router(workflow.router, prefix="/api/workflows")  # Frontend expects /workflows
```

### Verify with Code

Add this to your startup to log registered routes:

```python
@app.on_event("startup")
def startup_event():
    print("Registered routes:")
    for route in app.routes:
        print(f"  {route.methods} {route.path}")
```

You should see:
```
POST /workflows/save
GET  /workflows
GET  /workflows/{workflow_id}
PUT  /workflows/{workflow_id}
DELETE /workflows/{workflow_id}
POST /workflows/{workflow_id}/clone
```

---

## Checklist 2: CORS Configuration

The frontend needs CORS headers to make requests.

### Add CORS Middleware

```python
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add CORS BEFORE including routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, use specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# THEN include routers
app.include_router(workflow.router, prefix="/workflows")
```

### Test CORS with curl

```bash
curl -X OPTIONS \
  -H "Origin: https://your-frontend-domain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v \
  https://veo-api-82187245577.us-central1.run.app/workflows/save
```

Should return:
```
HTTP/1.1 200 OK
access-control-allow-origin: *
access-control-allow-methods: *
access-control-allow-headers: *
```

---

## Checklist 3: Test Endpoints Manually

### Get a Firebase Token

1. Open browser console on your frontend
2. Run:
```javascript
firebase.auth().currentUser.getIdToken().then(console.log)
```
3. Copy the token

### Test List Endpoint

```bash
TOKEN="your_firebase_token_here"

curl -H "Authorization: Bearer $TOKEN" \
  "https://veo-api-82187245577.us-central1.run.app/workflows?scope=public"
```

**Expected:** `{"workflows": []}`  
**If 404:** Router not mounted or deployed  
**If 401:** Firebase auth issue  
**If CORS error:** CORS not configured  

### Test Save Endpoint

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workflow",
    "description": "Testing",
    "is_public": false,
    "nodes": [
      {
        "id": "test-1",
        "type": "imageInput",
        "position": {"x": 0, "y": 0},
        "data": {"label": "Test"}
      }
    ],
    "edges": []
  }' \
  "https://veo-api-82187245577.us-central1.run.app/workflows/save"
```

**Expected:** `{"id": "wf_1234567890_abc"}`  
**If 404:** Router not mounted  
**If 422:** Request body validation failed  
**If 500:** Backend logic error (check logs)  

---

## Checklist 4: Verify Deployment

### Cloud Run Deployment

```bash
# Check service is deployed
gcloud run services describe veo-api --region=us-central1

# Check latest revision is serving 100% traffic
gcloud run revisions list --service=veo-api --region=us-central1

# View recent logs
gcloud run services logs read veo-api --region=us-central1 --limit=50
```

### Check Environment Variables

Ensure these are set in Cloud Run:
- `GCS_BUCKET` (if using Google Cloud Storage)
- Any Firebase admin SDK credentials

```bash
gcloud run services describe veo-api --region=us-central1 --format="value(spec.template.spec.containers[0].env)"
```

---

## Checklist 5: Firebase Authentication

### Verify Token Decoding

Your `get_current_user` dependency should:

```python
from fastapi import HTTPException, Depends, Header
from firebase_admin import auth

async def get_current_user(authorization: str = Header(...)):
    """Extract user from Firebase ID token"""
    try:
        # Remove "Bearer " prefix
        token = authorization.replace("Bearer ", "")
        
        # Decode token
        decoded_token = auth.verify_id_token(token)
        
        # Return user info
        return {
            "uid": decoded_token["uid"],
            "email": decoded_token.get("email", "")
        }
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication")
```

### Common Auth Issues

**Problem:** 401 Unauthorized even with valid token  
**Solution:** Check Firebase Admin SDK is initialized:

```python
import firebase_admin
from firebase_admin import credentials

# Initialize on app startup (only once!)
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()  # Use ADC
    # OR
    cred = credentials.Certificate("path/to/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
```

---

## Checklist 6: Check Request/Response Format

### Frontend Sends This

```json
{
  "name": "My Workflow",
  "description": "Description here",
  "is_public": false,
  "nodes": [
    {
      "id": "node-1",
      "type": "imageInput",
      "position": {"x": 100, "y": 200},
      "data": {"label": "Image Input", "imageUrl": null}
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "sourceHandle": "image",
      "targetHandle": "first_frame"
    }
  ]
}
```

### Backend Must Return This

```json
{
  "id": "wf_1734300000_abc123"
}
```

### Verify Your Pydantic Models

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Any

class NodePosition(BaseModel):
    x: float
    y: float

class WorkflowNode(BaseModel):
    id: str
    type: str
    position: NodePosition
    data: dict  # Or Any

class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class SaveWorkflowRequest(BaseModel):
    name: str = Field(..., max_length=100)
    description: str = ""
    is_public: bool = False
    nodes: List[WorkflowNode] = Field(..., min_items=1, max_items=100)
    edges: List[WorkflowEdge] = []

class WorkflowIdResponse(BaseModel):
    id: str
```

---

## Checklist 7: Test Full Flow

### Step-by-Step Test

1. **Start Fresh**
   ```bash
   # Redeploy to Cloud Run
   gcloud run deploy veo-api --region=us-central1
   ```

2. **Check Health**
   ```bash
   curl https://veo-api-82187245577.us-central1.run.app/
   # Should return something (not 404)
   ```

3. **Test with Frontend**
   - Open frontend in browser
   - Open Developer Console (F12)
   - Go to Network tab
   - Try to save a workflow
   - Check the request/response

4. **Look for Red Flags**
   - Status 404: Router issue
   - Status 401: Auth issue
   - Status 422: Request validation failed
   - Status 500: Backend error (check logs)
   - CORS error in console: CORS not configured
   - Network error: Backend not deployed or down

---

## Common Issues & Solutions

### Issue 1: "Cannot GET /workflows/save"

**Cause:** You're accessing GET instead of POST  
**Solution:** Frontend calls POST /workflows/save, not GET

### Issue 2: "Method Not Allowed"

**Cause:** Wrong HTTP method  
**Solution:** Verify router uses `@router.post("/save")` not `@router.get("/save")`

### Issue 3: "Route not found: /workflows/save"

**Cause:** Router not mounted with `/workflows` prefix  
**Solution:** Add `prefix="/workflows"` to `include_router()`

### Issue 4: Token Expired or Invalid

**Cause:** Firebase token expired (1 hour lifetime)  
**Solution:** Tell user to sign out and sign back in

### Issue 5: Request Body Validation Failed

**Cause:** Pydantic models don't match frontend data structure  
**Solution:** Check your models accept the exact field names (nodes, edges, name, etc.)

---

## Debug Logging

Add this to your workflow router for debugging:

```python
@router.post("/save")
async def save_workflow(
    request: SaveWorkflowRequest,
    user: dict = Depends(get_current_user)
):
    # Log everything for debugging
    print(f"[SAVE] User: {user['email']}")
    print(f"[SAVE] Workflow name: {request.name}")
    print(f"[SAVE] Node count: {len(request.nodes)}")
    print(f"[SAVE] Edge count: {len(request.edges)}")
    print(f"[SAVE] Is public: {request.is_public}")
    
    try:
        # Your save logic here
        workflow_id = "wf_test_123"
        
        print(f"[SAVE] Success! ID: {workflow_id}")
        return {"id": workflow_id}
        
    except Exception as e:
        print(f"[SAVE] ERROR: {e}")
        raise
```

Then check Cloud Run logs:
```bash
gcloud run services logs read veo-api --region=us-central1 --limit=100
```

---

## Success Criteria

When everything works, you'll see:

### In Browser Console (Frontend)
```
[saveWorkflow] Request: {method: 'POST', url: '...', ...}
[saveWorkflow] Response: {status: 200, ok: true, ...}
[saveWorkflow] Success: {id: 'wf_1234567890_abc'}
```

### In Cloud Run Logs (Backend)
```
[SAVE] User: user@example.com
[SAVE] Workflow name: My Workflow
[SAVE] Node count: 5
[SAVE] Success! ID: wf_1734300000_abc123
```

### In Frontend UI
- ✅ Toast: "Workflow saved"
- ✅ Workflow appears in "My Workflows" tab
- ✅ No error messages

---

## Still Not Working?

### Contact Frontend Team

Provide this info:
1. Full error message from Cloud Run logs
2. Full request body you received (sanitized)
3. Your router code (how it's mounted)
4. Output of registered routes on startup
5. Screenshot of request/response in browser Network tab

### Quick Test: Use Mock Storage

To verify routing works, bypass database temporarily:

```python
@router.post("/save")
async def save_workflow(request: SaveWorkflowRequest, user: dict = Depends(get_current_user)):
    # Bypass database, just return a test ID
    import time
    test_id = f"wf_{int(time.time())}_test"
    print(f"[TEST] Would save workflow '{request.name}' for user {user['email']}")
    return {"id": test_id}
```

If this works (200 response), your storage/database is the issue.  
If this still 404s, your router is not mounted correctly.

---

## Need More Help?

Check the frontend implementation:
- `client/lib/workflow-api.ts` - API calls
- `client/components/workflow/SaveWorkflowDialog.tsx` - Save UI

The frontend now has detailed error logging. Check browser console for:
- Full request details
- Response status and body
- Helpful error messages
