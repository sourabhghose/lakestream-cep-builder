"""
User preferences API router.

GET /api/preferences - Get current user's preferences (defaults if none saved).
PUT /api/preferences - Update current user's preferences.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import UserInfo, get_current_user
from app.models.preferences import UserPreferences
from app.services.preferences_store import get_preferences_store

router = APIRouter()


def _store():
    return get_preferences_store()


@router.get("", response_model=UserPreferences)
async def get_preferences(
    user: UserInfo = Depends(get_current_user),
) -> UserPreferences:
    """Get current user's preferences. Returns defaults if none saved."""
    return _store().get(user.user_id)


@router.put("", response_model=UserPreferences)
async def update_preferences(
    preferences: UserPreferences,
    user: UserInfo = Depends(get_current_user),
) -> UserPreferences:
    """Update current user's preferences."""
    _store().save(user.user_id, preferences)
    return preferences
