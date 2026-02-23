"""
CRUD API router for pipeline management.

Stores pipelines in-memory for MVP; will be replaced with Unity Catalog storage.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.models.pipeline import (
    PipelineCreateRequest,
    PipelineDefinition,
    PipelineEdge,
    PipelineNode,
    PipelineUpdateRequest,
)

router = APIRouter()

# In-memory store for pipelines (MVP - replace with UC later)
_pipelines: dict[str, PipelineDefinition] = {}


@router.post("", response_model=PipelineDefinition)
async def create_pipeline(request: PipelineCreateRequest) -> PipelineDefinition:
    """Create a new pipeline."""
    pipeline_id = str(uuid.uuid4())
    now = datetime.utcnow()
    pipeline = PipelineDefinition(
        id=pipeline_id,
        name=request.name,
        description=request.description,
        nodes=request.nodes,
        edges=request.edges,
        created_at=now,
        updated_at=now,
        version=1,
        status="draft",
    )
    _pipelines[pipeline_id] = pipeline
    return pipeline


@router.get("", response_model=list[PipelineDefinition])
async def list_pipelines() -> list[PipelineDefinition]:
    """List all pipelines."""
    return list(_pipelines.values())


@router.get("/{pipeline_id}", response_model=PipelineDefinition)
async def get_pipeline(pipeline_id: str) -> PipelineDefinition:
    """Get a single pipeline by ID."""
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return _pipelines[pipeline_id]


@router.put("/{pipeline_id}", response_model=PipelineDefinition)
async def update_pipeline(
    pipeline_id: str, request: PipelineUpdateRequest
) -> PipelineDefinition:
    """Update an existing pipeline."""
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    existing = _pipelines[pipeline_id]
    update_data = request.model_dump(exclude_unset=True)

    # Build updated pipeline
    updated = existing.model_copy(update=update_data)
    updated.updated_at = datetime.utcnow()
    updated.version = existing.version + 1

    _pipelines[pipeline_id] = updated
    return updated


@router.delete("/{pipeline_id}", status_code=204)
async def delete_pipeline(pipeline_id: str) -> None:
    """Delete a pipeline."""
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    del _pipelines[pipeline_id]
