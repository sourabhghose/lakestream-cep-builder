"""
Templates API router.

List, create, and delete pipeline templates (built-in + user-created).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import UserInfo, get_current_user
from app.services.template_store import get_template_store
from pydantic import BaseModel

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    industry: str = ""
    canvas_json: dict


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    industry: str
    canvas_json: dict
    is_builtin: bool
    created_by: str | None = None
    created_at: str | None = None


def _store():
    return get_template_store()


@router.get("", response_model=list[TemplateResponse])
async def list_templates() -> list[TemplateResponse]:
    """List all templates (built-in + user-created)."""
    items = _store().list_all()
    return [TemplateResponse(**item) for item in items]


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(
    request: TemplateCreate,
    user: UserInfo = Depends(get_current_user),
) -> TemplateResponse:
    """Save current pipeline as a new template."""
    template_id = _store().create(
        name=request.name,
        description=request.description,
        industry=request.industry,
        canvas_json=request.canvas_json,
        created_by=user.email,
    )
    return TemplateResponse(
        id=template_id,
        name=request.name,
        description=request.description,
        industry=request.industry,
        canvas_json=request.canvas_json,
        is_builtin=False,
        created_by=user.email,
        created_at=None,
    )


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: str) -> None:
    """Delete a user-created template. Cannot delete built-in templates."""
    if not _store().delete(template_id):
        raise HTTPException(
            status_code=404,
            detail="Template not found or cannot delete built-in template",
        )
