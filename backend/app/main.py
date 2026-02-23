"""
LakeStream CEP Builder API - FastAPI application entry point.

Provides REST API for pipeline CRUD, code generation, and deployment
to Databricks Lakeflow (SDP) or Spark Structured Streaming.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import codegen, codeparse, deploy, pipelines

app = FastAPI(
    title="LakeStream CEP Builder API",
    description="Visual CEP Pipeline Builder backend - generates Databricks code from pipeline graphs",
    version="0.1.0",
)

# CORS middleware - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(pipelines.router, prefix="/api/pipelines", tags=["pipelines"])
app.include_router(codegen.router, prefix="/api/codegen", tags=["codegen"])
app.include_router(codeparse.router, prefix="/api/codeparse", tags=["codeparse"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["deploy"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for load balancers and monitoring."""
    return {"status": "healthy", "service": "LakeStream CEP Builder API"}
