"""Pydantic models for user preferences."""

from __future__ import annotations

from pydantic import BaseModel, Field


def _default_canvas_settings() -> dict:
    return {
        "snap_to_grid": True,
        "grid_size": 15,
        "show_minimap": True,
        "auto_generate_code": True,
    }


class UserPreferences(BaseModel):
    """User preferences for the CEP builder."""

    default_catalog: str | None = None
    default_schema: str | None = None
    canvas_settings: dict = Field(
        default_factory=_default_canvas_settings,
    )
    recent_pipelines: list[str] = Field(default_factory=list)
