"""
LakeStream CEP Builder API - FastAPI application entry point.

Provides REST API for pipeline CRUD, code generation, and deployment
to Databricks Lakeflow (SDP) or Spark Structured Streaming.
Serves the static Next.js frontend when built for Databricks App deployment.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import codegen, codeparse, deploy, pipelines, preview, schema_discovery
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database schema on startup."""
    init_db()
    yield


app = FastAPI(
    title="LakeStream CEP Builder API",
    description="Visual CEP Pipeline Builder backend - generates Databricks code from pipeline graphs",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: production = same origin (no CORS needed); development = allow Next.js dev server
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
if ENVIRONMENT == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# 1. API routes (must be registered before static files)
app.include_router(pipelines.router, prefix="/api/pipelines", tags=["pipelines"])
app.include_router(codegen.router, prefix="/api/codegen", tags=["codegen"])
app.include_router(codeparse.router, prefix="/api/codeparse", tags=["codeparse"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["deploy"])
app.include_router(preview.router, prefix="/api/preview", tags=["preview"])
app.include_router(schema_discovery.router, prefix="/api/schema", tags=["schema"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for load balancers and monitoring."""
    return {"status": "healthy", "service": "LakeStream CEP Builder API"}

# 2. Static files: Next.js build output (frontend/out/)
# Path: backend/app/main.py -> backend/app -> backend -> frontend/out
STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"
if STATIC_DIR.exists():
    # 2a. /_next/* - Next.js static assets
    app.mount("/_next", StaticFiles(directory=str(STATIC_DIR / "_next")), name="next-static")
    # 2b. / - Static files from out/ root (index.html, favicon, etc.)
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    # 2c. SPA fallback: 404 handler returns index.html for client-side routes
    @app.exception_handler(StarletteHTTPException)
    async def spa_fallback(request: Request, exc: StarletteHTTPException):
        if exc.status_code != 404:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        path = request.url.path
        if path.startswith("/api") or path.startswith("/_next"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        index_path = STATIC_DIR / "index.html"
        if index_path.is_file():
            return FileResponse(str(index_path))
        return JSONResponse({"detail": "Not Found"}, status_code=404)
else:

    @app.get("/")
    async def root_hint():
        return JSONResponse({
            "message": "LakeStream CEP Builder API",
            "frontend": "Build frontend with: make build-frontend",
            "docs": "/docs",
        })
