"""
Code generation API router.

Accepts pipeline definitions and returns generated Databricks code (SDP or SSS).
"""

from fastapi import APIRouter, HTTPException

from app.codegen.router import generate
from app.models.pipeline import CodeGenerationResponse, PipelineDefinition

router = APIRouter()


@router.post("/generate", response_model=CodeGenerationResponse)
async def generate_code(pipeline: PipelineDefinition) -> CodeGenerationResponse:
    """
    Generate Databricks code from a pipeline definition.

    Returns SDP (Lakeflow Declarative Pipelines) and/or SSS (Spark Structured
    Streaming) code based on the pipeline's node types.
    """
    try:
        return generate(pipeline)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
