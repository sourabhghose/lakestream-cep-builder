"""
CRUD API router for pipeline management.

Uses PipelineStore for persistence (LocalFileStore or DatabricksVolumeStore).
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth import UserInfo, get_current_user
from app.models.pipeline import (
    PipelineCreateRequest,
    PipelineDefinition,
    PipelineSummary,
    PipelineUpdateRequest,
)
from app.services.pipeline_store import get_pipeline_store

router = APIRouter()


def _store():
    return get_pipeline_store()


@router.post("", response_model=PipelineDefinition)
async def create_pipeline(
    request: PipelineCreateRequest,
    user: UserInfo = Depends(get_current_user),
) -> PipelineDefinition:
    """Create a new pipeline."""
    pipeline_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc)
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
        created_by=user.email,
    )
    _store().save(pipeline)
    return pipeline


@router.get("", response_model=list[PipelineSummary])
async def list_pipelines() -> list[PipelineSummary]:
    """List all pipelines (summary only)."""
    return _store().list_all()


@router.get("/{pipeline_id}", response_model=PipelineDefinition)
async def get_pipeline(pipeline_id: str) -> PipelineDefinition:
    """Get a single pipeline by ID."""
    pipeline = _store().get(pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline


@router.put("/{pipeline_id}", response_model=PipelineDefinition)
async def update_pipeline(
    pipeline_id: str,
    request: PipelineUpdateRequest,
    user: UserInfo = Depends(get_current_user),
) -> PipelineDefinition:
    """Update an existing pipeline."""
    existing = _store().get(pipeline_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    update_data = request.model_dump(exclude_unset=True)
    updated = existing.model_copy(update=update_data)

    try:
        return _store().update(pipeline_id, updated)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Pipeline not found")


@router.delete("/{pipeline_id}", status_code=204)
async def delete_pipeline(pipeline_id: str) -> None:
    """Delete a pipeline."""
    if not _store().delete(pipeline_id):
        raise HTTPException(status_code=404, detail="Pipeline not found")
