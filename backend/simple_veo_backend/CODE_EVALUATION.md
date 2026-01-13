# Code Evaluation Report

Comprehensive evaluation of the GenMedia API backend codebase with improvement suggestions.

---

## Executive Summary

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | 7/10 | Clean separation, but some coupling issues |
| Security | 6/10 | Good auth, but CORS and config concerns |
| Performance | 5/10 | See PERFORMANCE_ANALYSIS.md |
| Error Handling | 7/10 | Consistent, but could be more specific |
| Testing | 8/10 | Good coverage with unit, integration, e2e |
| Code Quality | 7/10 | Clean code, some improvements possible |

---

## 1. Security Concerns

### 1.1 CORS Configuration (HIGH)

**File:** `app/main.py:12-18`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ Allows ANY origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Problem:** `allow_origins=["*"]` with `allow_credentials=True` is a security risk. Any website can make authenticated requests to your API.

**Recommendation:**
```python
ALLOWED_ORIGINS = [
    "https://your-frontend-domain.com",
    "http://localhost:3000",  # Dev only
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### 1.2 Hardcoded Email Whitelist (MEDIUM)

**File:** `app/config.py:12-16`

```python
ALLOWED_EMAILS: ClassVar[list[str]] = [
    "ldebortolialves@hubspot.com",
    "meganzinka@gmail.com",
    "sfiske@hubspot.com"
]
```

**Problem:** Hardcoded in source code. Requires code deployment to add/remove users.

**Recommendation:** Move to environment variable or database:
```python
# From environment
ALLOWED_EMAILS: list[str] = Field(default_factory=list)

# In .env
ALLOWED_EMAILS=["user1@example.com","user2@example.com"]
```

### 1.3 Service Account Key in Repo (HIGH)

**File:** `app/config.py:20`

```python
firebase_service_account_key: str = "serviceAccountKey.json"
```

**Problem:** If `serviceAccountKey.json` is committed, credentials are exposed.

**Recommendation:**
1. Add to `.gitignore`
2. Use environment variable for path
3. Use GCP Workload Identity in production

### 1.4 Sensitive Data in Logs (LOW)

**File:** `app/services/generation.py:209`

```python
logger.info(f"Adding first frame to request, original length: {len(first_frame)}, cleaned length: {len(cleaned_frame)}")
```

**Problem:** Logs may contain sensitive prompt data or be too verbose.

**Recommendation:** Use DEBUG level for verbose logs, sanitize user data.

---

## 2. Architecture Improvements

### 2.1 Dependency Injection

**Current:** Services instantiated inline

```python
# routers/generation.py
def get_generation_service() -> GenerationService:
    return GenerationService()  # New instance every request
```

**Recommendation:** Use FastAPI's dependency injection with lifespan:

```python
# dependencies.py
from functools import lru_cache

@lru_cache
def get_generation_service() -> GenerationService:
    return GenerationService()

# Or use lifespan context
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.generation_service = GenerationService()
    yield
```

### 2.2 Configuration Validation

**Current:** No validation on config values

**Recommendation:** Add Pydantic validators:

```python
from pydantic import field_validator

class Settings(BaseSettings):
    location: str = "us-central1"

    @field_validator('location')
    @classmethod
    def validate_location(cls, v):
        valid_locations = ['us-central1', 'global', 'europe-west1']
        if v not in valid_locations:
            raise ValueError(f'location must be one of {valid_locations}')
        return v
```

### 2.3 API Versioning

**Current:** No API versioning

**Recommendation:** Add version prefix for future compatibility:

```python
app.include_router(generation.router, prefix="/v1/generate", tags=["generation"])
```

### 2.4 Response Model Consistency

**Current:** Mixed response types (dict vs Pydantic models)

```python
# Returns dict
async def generate_video(...) -> dict:
    return {"status": "processing", ...}

# Returns Pydantic model
async def generate_image(...) -> ImageResponse:
```

**Recommendation:** Use Pydantic models for all responses:

```python
class VideoGenerationStartResponse(BaseModel):
    status: str
    operation_name: str
    message: str
```

---

## 3. Error Handling Improvements

### 3.1 Generic Exception Handling

**Current:**
```python
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

**Recommendation:** Create custom exceptions:

```python
# exceptions.py
class GenerationError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code

class RateLimitError(GenerationError):
    def __init__(self, retry_after: int = 60):
        super().__init__("Rate limit exceeded", 429)
        self.retry_after = retry_after

# In router
@app.exception_handler(GenerationError)
async def generation_error_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "type": type(exc).__name__}
    )
```

### 3.2 Missing Input Validation

**Current:** No max length on prompts

**Recommendation:**
```python
class ImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)

    @field_validator('prompt')
    @classmethod
    def sanitize_prompt(cls, v):
        return v.strip()
```

### 3.3 Rate Limit Response Headers

**Current:** Just raises exception on 429

**Recommendation:** Include retry-after header:

```python
if response.status_code == 429:
    raise HTTPException(
        status_code=429,
        detail="Rate limit exceeded",
        headers={"Retry-After": "60"}
    )
```

---

## 4. Code Quality Improvements

### 4.1 Magic Numbers

**Current:**
```python
if len(image_bytes) < 100:  # Magic number
    ...
timeout=300.0  # Magic number
```

**Recommendation:** Use constants:

```python
# constants.py
MIN_IMAGE_SIZE_BYTES = 100
DEFAULT_API_TIMEOUT = 300.0
MAX_REFERENCE_IMAGES = 3
```

### 4.2 Duplicate Code

**File:** `app/services/generation.py`

The `_strip_base64_prefix` method appears in both `GenerationService` and `LibraryServiceFirestore`.

**Recommendation:** Extract to utility module:

```python
# utils/base64_utils.py
def strip_base64_prefix(data: str) -> str:
    """Remove data URL prefix if present"""
    ...
```

### 4.3 Type Hints

**Current:** Some return types missing

```python
async def generate_video(...) -> dict:  # Could be more specific
```

**Recommendation:** Use TypedDict or Pydantic:

```python
from typing import TypedDict

class VideoGenerationResult(TypedDict):
    status: str
    operation_name: str
    message: str
```

### 4.4 Docstrings

**Current:** Minimal docstrings

**Recommendation:** Add comprehensive docstrings:

```python
async def generate_image(
    self,
    prompt: str,
    user_id: str,
    reference_images: Optional[List[str]] = None,
    aspect_ratio: str = "1:1",
    resolution: str = "1K"
) -> ImageResponse:
    """
    Generate images using Gemini with retry on rate limits.

    Args:
        prompt: Text description of the image to generate
        user_id: Firebase user ID for asset ownership
        reference_images: Optional list of base64-encoded reference images
        aspect_ratio: Output aspect ratio (1:1, 16:9, 9:16, 3:4, 4:3)
        resolution: Output resolution (1K, 2K, 4K)

    Returns:
        ImageResponse containing list of generated images as base64

    Raises:
        Exception: If generation fails after all retries
    """
```

---

## 5. Testing Improvements

### 5.1 Current Coverage

| Test Type | Files | Coverage |
|-----------|-------|----------|
| Unit | 10 files | Good - mocks external services |
| Integration | 2 files | Moderate - tests real APIs |
| E2E | 8 files | Good - full flow testing |

### 5.2 Missing Tests

1. **Edge cases for base64 handling**
   - Malformed base64
   - Very large images (memory limits)
   - Invalid image formats

2. **Concurrent request handling**
   - Multiple simultaneous video generations
   - Rate limit behavior under load

3. **Error recovery**
   - Network failures mid-request
   - Partial failures (image saved, library save failed)

### 5.3 Test Data Management

**Current:** Hardcoded test data in fixtures

**Recommendation:** Use factory pattern:

```python
# tests/factories.py
import factory

class ImageRequestFactory(factory.Factory):
    class Meta:
        model = dict

    prompt = factory.Faker('sentence')
    aspect_ratio = "1:1"
    resolution = "1K"
```

---

## 6. Operational Improvements

### 6.1 Health Check Enhancement

**Current:** Basic health endpoint

**Recommendation:** Add dependency health checks:

```python
@router.get("/health")
async def health_check():
    checks = {
        "api": "healthy",
        "firestore": await check_firestore(),
        "gcs": await check_gcs(),
        "gemini": await check_gemini_api(),
    }
    status = "healthy" if all(v == "healthy" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
```

### 6.2 Request Tracing

**Current:** No request correlation

**Recommendation:** Add request ID middleware:

```python
from uuid import uuid4

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

### 6.3 Metrics/Monitoring

**Recommendation:** Add Prometheus metrics:

```python
from prometheus_client import Counter, Histogram

REQUEST_COUNT = Counter('api_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
REQUEST_LATENCY = Histogram('api_request_latency_seconds', 'Request latency', ['endpoint'])
```

---

## 7. Priority Action Items

### Immediate (Security)
1. [ ] Fix CORS to whitelist specific origins
2. [ ] Ensure `serviceAccountKey.json` is in `.gitignore`
3. [ ] Move `ALLOWED_EMAILS` to environment variable

### Short-term (Quality)
4. [ ] Add input validation (prompt length, image size limits)
5. [ ] Create custom exception classes
6. [ ] Extract duplicate utility functions

### Medium-term (Performance)
7. [ ] Implement service caching (see PERFORMANCE_ANALYSIS.md)
8. [ ] Add request tracing
9. [ ] Batch Firestore queries

### Long-term (Architecture)
10. [ ] Add API versioning
11. [ ] Implement health check dependencies
12. [ ] Add metrics/monitoring

---

## Summary

The codebase is well-structured for a FastAPI application with good separation of concerns. The main areas needing attention are:

1. **Security:** CORS configuration and credential management
2. **Performance:** See existing PERFORMANCE_ANALYSIS.md
3. **Observability:** Request tracing, metrics, enhanced health checks
4. **Code Quality:** Constants, type hints, custom exceptions

The testing infrastructure is solid with good coverage across unit, integration, and e2e tests.
