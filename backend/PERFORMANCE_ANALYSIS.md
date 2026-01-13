# Performance Analysis Report

This document identifies performance anti-patterns, N+1 queries, and inefficient algorithms in the codebase.

---

## Critical Issues

### 1. N+1 Query Pattern in Asset Resolution

**Files Affected:**
- `app/services/workflow_firestore.py:72-87`
- `app/services/library_firestore.py:211-227`

**Problem:** Both `_resolve_asset_urls()` methods iterate through asset IDs and make individual Firestore document fetches in a loop.

```python
# workflow_firestore.py:72-87
for ref in asset_refs:
    try:
        doc = self.assets_ref.document(ref).get()  # N individual queries!
        ...
```

```python
# library_firestore.py:211-227
for asset_id in asset_ids:
    try:
        doc = self.assets_ref.document(asset_id).get()  # N individual queries!
        ...
```

**Impact:** If a workflow has 20 asset references, this makes 20 separate Firestore round-trips instead of 1.

**Solution:** Use Firestore's `get_all()` batch operation:
```python
doc_refs = [self.assets_ref.document(ref) for ref in asset_refs]
docs = self.db.get_all(doc_refs)  # Single batch query
```

---

### 2. Sequential HTTP Calls for Reference Image Resolution

**File:** `app/routers/generation.py:95-103`

**Problem:** Reference images are resolved sequentially in a loop:

```python
for ref_img in request.reference_images:
    if is_asset_id(ref_img):
        img_data = await resolve_asset_to_base64(ref_img, user["uid"])  # Sequential!
        reference_images_data.append(img_data)
```

**Impact:** If 3 reference images are provided, this adds 3x the latency instead of resolving all in parallel.

**Solution:** Use `asyncio.gather()` for parallel resolution:
```python
tasks = [resolve_asset_to_base64(ref_img, user["uid"]) for ref_img in request.reference_images if is_asset_id(ref_img)]
results = await asyncio.gather(*tasks)
```

---

### 3. Blocking Synchronous Firestore Calls in Async Functions

**Files Affected:** All service files

**Problem:** The codebase uses synchronous Firestore SDK methods inside `async` functions, blocking the event loop.

**Examples:**
- `library_firestore.py:102` - `self.assets_ref.document(asset_id).set(asset_data)`
- `library_firestore.py:137` - `query.stream()`
- `library_firestore.py:159, 188, 213, 233, 247, 253` - `.get()`, `.delete()` calls
- `workflow_firestore.py:164, 186, 215, 261, 298, 312, 325, 336, 367` - All Firestore calls

**Impact:** Each blocking call prevents other async operations from running, reducing throughput.

**Solution Options:**
1. Use `run_in_executor()` to run sync calls in a thread pool:
```python
loop = asyncio.get_event_loop()
await loop.run_in_executor(None, lambda: self.assets_ref.document(asset_id).set(asset_data))
```
2. Use the async Firestore client (if available in the SDK version)
3. Move to a truly async database client

---

### 4. Blocking GCS Operations in Async Functions

**File:** `app/services/library_firestore.py`

**Problem:** Google Cloud Storage operations are synchronous:

```python
# Line 87
blob.upload_from_string(file_bytes, content_type=mime_type)  # Blocking!

# Lines 247-248
if blob.exists():  # Blocking!
    blob.delete()   # Blocking!
```

**Impact:** Large file uploads block the entire async event loop.

**Solution:** Use `run_in_executor()` or switch to async GCS operations.

---

### 5. New Service Instance Created Per Request

**Files Affected:**
- `app/routers/generation.py:47-48`
- `app/routers/library.py:11-12`
- `app/routers/workflow.py:18-19`
- `app/routers/generation.py:23`

**Problem:** Each request creates new service instances:

```python
def get_generation_service() -> GenerationService:
    return GenerationService()  # New instance every request!

def get_library_service() -> LibraryServiceFirestore:
    return LibraryServiceFirestore()  # New instance every request!
```

Inside `GenerationService.__init__`:
```python
self.library = library_service or LibraryServiceFirestore()  # Another new instance!
```

Inside `resolve_asset_to_base64()`:
```python
library_service = LibraryServiceFirestore()  # Yet another new instance!
```

**Impact:**
- New GCS `storage.Client()` created per request
- New Firestore collection references created per request
- Unnecessary object allocation overhead

**Solution:** Use FastAPI's dependency injection with caching or create singleton services:

```python
_library_service: LibraryServiceFirestore | None = None

def get_library_service() -> LibraryServiceFirestore:
    global _library_service
    if _library_service is None:
        _library_service = LibraryServiceFirestore()
    return _library_service
```

Or use `functools.lru_cache`:
```python
@lru_cache
def get_library_service() -> LibraryServiceFirestore:
    return LibraryServiceFirestore()
```

---

### 6. HTTP Client Created Per Request

**Files Affected:**
- `app/routers/generation.py:30`
- `app/services/generation.py:283, 319, 445`

**Problem:** New `httpx.AsyncClient` created for each API call:

```python
async with httpx.AsyncClient() as client:
    response = await client.get(asset["url"])
```

**Impact:** Connection establishment overhead, no connection pooling.

**Solution:** Create a shared client at module level or inject via dependency:

```python
# At module level
_http_client: httpx.AsyncClient | None = None

async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=300.0)
    return _http_client
```

---

### 7. Auth Whitelist Recomputed Every Request

**File:** `app/auth.py:50`

**Problem:** Whitelist normalization happens on every authentication:

```python
allowed = [e.lower().strip() for e in settings.ALLOWED_EMAILS]  # Computed every time!
if user_email not in allowed:
    ...
```

**Impact:** Small but unnecessary CPU overhead on every authenticated request.

**Solution:** Precompute at module load:

```python
# At module level, after settings loaded
ALLOWED_EMAILS_SET = frozenset(e.lower().strip() for e in settings.ALLOWED_EMAILS)

# In function
if user_email not in ALLOWED_EMAILS_SET:
    ...
```

---

### 8. Missing Pagination on Workflow List

**File:** `app/services/workflow_firestore.py:169-207`

**Problem:** `list_workflows()` returns all workflows without limit:

```python
query = self.workflows_ref.where(filter=FieldFilter("is_public", "==", True))
query = query.order_by("created_at", direction="DESCENDING")
# No .limit() call!
docs = query.stream()
```

**Impact:** As public workflows grow, this query becomes increasingly expensive.

**Solution:** Add pagination support:

```python
async def list_workflows(
    self,
    scope: str,
    user_id: str,
    limit: int = 50,
    start_after: Optional[str] = None
) -> List[Dict]:
    ...
    query = query.limit(limit)
    if start_after:
        start_doc = self.workflows_ref.document(start_after).get()
        query = query.start_after(start_doc)
```

---

### 9. Inefficient Logging in List Endpoints

**File:** `app/routers/workflow.py:86-87`

**Problem:** Logs every workflow in the response:

```python
for wf in workflows:
    logger.info(f"Returning workflow {wf.get('id')}: {wf.get('name')} ...")
```

**Impact:** Adds O(n) overhead to response time and generates excessive logs.

**Solution:** Log summary instead:
```python
logger.info(f"Returning {len(workflows)} workflows for user {user['email']}")
```

---

## Code Quality Issues (Bugs)

### 10. Unresolved Merge Conflict Markers

**File:** `app/services/generation.py`

**Problem:** The file contains unresolved Git merge conflicts:

- Lines 98-173: `<<<<<<< HEAD` ... `>>>>>>> firestore-migration`
- Lines 273-297: Another merge conflict block

**Impact:** This will cause syntax errors or undefined behavior.

**Solution:** Resolve the merge conflicts immediately.

---

### 11. Duplicate Code in check_video_status

**File:** `app/services/generation.py:383-393`

**Problem:** The end of `check_video_status()` has duplicate code:

```python
# Lines 383-387
metadata = result.get("metadata", {})
return VideoStatusResponse(
    status="processing",
    progress=metadata.get("progressPercent", 0)
)

# Lines 389-393 (DUPLICATE!)
metadata = result.get("metadata", {})
return VideoStatusResponse(
    status="processing",
    progress=metadata.get("progressPercent", 0)
)
```

**Impact:** Dead code, confusing maintenance.

**Solution:** Remove the duplicate block.

---

## Memory Efficiency Issues

### 12. Large Base64 Data in Memory

**Files:**
- `app/services/library_firestore.py:84`
- `app/routers/generation.py:33-36`

**Problem:** Entire files are loaded into memory for base64 encoding/decoding:

```python
file_bytes = base64.b64decode(clean_data)  # Full file in memory
blob.upload_from_string(file_bytes, ...)   # Another copy
```

**Impact:** For large videos (100MB+), this doubles memory usage.

**Solution:** For very large files, consider streaming approaches or chunked uploads.

---

## Summary Table

| Issue | Severity | Location | Type |
|-------|----------|----------|------|
| N+1 queries in asset resolution | **High** | workflow_firestore.py, library_firestore.py | N+1 Query |
| Sequential HTTP calls for images | **High** | routers/generation.py | Inefficient Algorithm |
| Blocking Firestore in async | **High** | All services | Anti-pattern |
| Blocking GCS in async | **High** | library_firestore.py | Anti-pattern |
| New service per request | **Medium** | All routers | Inefficient |
| HTTP client per request | **Medium** | generation.py, routers | Inefficient |
| Auth whitelist recomputed | **Low** | auth.py | Inefficient |
| No pagination on workflows | **Medium** | workflow_firestore.py | Missing Feature |
| Excessive logging in loop | **Low** | routers/workflow.py | Anti-pattern |
| Merge conflict markers | **Critical** | services/generation.py | Bug |
| Duplicate code | **Low** | services/generation.py | Bug |
| Large files in memory | **Medium** | Multiple | Memory |

---

## Recommended Priority Order

1. **Fix merge conflicts** (Critical bug)
2. **Remove duplicate code** (Quick fix)
3. **Batch Firestore queries** (High impact)
4. **Parallelize HTTP calls** (High impact)
5. **Use `run_in_executor` for blocking calls** (High impact)
6. **Cache service instances** (Medium impact)
7. **Share HTTP client** (Medium impact)
8. **Add pagination** (Medium impact)
9. **Precompute auth whitelist** (Low impact)
10. **Fix logging** (Low impact)
