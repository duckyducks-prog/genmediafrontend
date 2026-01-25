import os
from uuid import uuid4
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import generation, library, health, workflow, elevenlabs, video_processing
from app.logging_config import setup_logger
from app.exceptions import AppError

logger = setup_logger(__name__)

app = FastAPI(title="GenMedia API")


# ============== REQUEST TRACING MIDDLEWARE ==============
# Adds X-Request-ID header to all requests for distributed tracing
# To revert: Remove this middleware function and uuid4 import

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """
    Add request ID for tracing requests across logs.

    - Uses X-Request-ID from incoming request if provided (from frontend/load balancer)
    - Generates a new UUID if not provided
    - Returns the request ID in response headers
    - Stores request_id in request.state for use in route handlers

    Frontend can read the X-Request-ID from response headers to correlate logs.
    """
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    # Store in request state for access in route handlers
    request.state.request_id = request_id

    # Log the request with its ID
    logger.info(f"[{request_id}] {request.method} {request.url.path}")

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ============== EXCEPTION HANDLERS ==============
# Custom exception handler for structured error responses
# To revert: Remove this handler and the AppError import

@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    """
    Handle all custom application errors with consistent JSON responses.

    Returns structured error response:
    {
        "error": "Human-readable message",
        "code": "MACHINE_READABLE_CODE",
        "details": {...}  // Optional additional context
    }
    """
    logger.warning(f"AppError {exc.code}: {exc.message} (status={exc.status})")
    return JSONResponse(
        status_code=exc.status,
        content=exc.to_dict()
    )

logger.info("Starting GenMedia API application")

# CORS configuration - restrict to known origins
# Set ALLOWED_ORIGINS env var as comma-separated list to override defaults
DEFAULT_ORIGINS = [
    "https://a5df8c929ca74fbc80fe95abcebf06ed-br-2c5574706fc84239af4efff8b.fly.dev",
    "https://genmedia-frontend-otfo2ctxma-uc.a.run.app",
    "http://localhost:3000",
]
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],  # Allow frontend to read this header
)

# Mount routers
# Health check at root level (no versioning needed)
app.include_router(health.router, tags=["health"])

# API v1 routes
# To add v2 in future: create new router files and mount with prefix="/v2/..."
app.include_router(generation.router, prefix="/v1/generate", tags=["generation"])
app.include_router(library.router, prefix="/v1/assets", tags=["assets"])
app.include_router(workflow.router, prefix="/v1/workflows", tags=["workflows"])
app.include_router(elevenlabs.router, tags=["elevenlabs"])
app.include_router(video_processing.router, tags=["video-processing"])