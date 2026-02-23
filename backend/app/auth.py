"""
OAuth middleware for Databricks App user identity extraction.

When deployed as a Databricks App, the platform injects a bearer token in the
Authorization header. This module validates the token and extracts user identity
for created_by, deployed_by fields.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Annotated

from fastapi import Depends, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

def _get_default_user() -> UserInfo:
    """Return the default user for development mode or when token validation fails."""
    return UserInfo(
        user_id="local",
        email="local@dev",
        display_name="Local Developer",
    )


class UserInfo(BaseModel):
    """User identity extracted from Databricks OAuth token."""

    user_id: str = Field(..., description="Databricks user ID or 'local' in dev")
    email: str = Field(..., description="User email (user_name in Databricks)")
    display_name: str = Field(..., description="Display name")


# Simple in-memory cache: token -> (UserInfo, expiry_timestamp)
_user_cache: dict[str, tuple[UserInfo, float]] = {}
_cache_lock = threading.Lock()
CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_cached_user(token: str) -> UserInfo | None:
    """Return cached UserInfo if valid, else None."""
    with _cache_lock:
        entry = _user_cache.get(token)
        if not entry:
            return None
        user_info, expiry = entry
        if time.time() >= expiry:
            del _user_cache[token]
            return None
        return user_info


def _set_cached_user(token: str, user_info: UserInfo) -> None:
    """Cache UserInfo for the token."""
    with _cache_lock:
        _user_cache[token] = (user_info, time.time() + CACHE_TTL_SECONDS)


def _extract_bearer_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    return auth[7:].strip() or None


def _fetch_user_from_databricks(token: str, host: str) -> UserInfo | None:
    """Validate token and fetch user info via Databricks SDK."""
    try:
        from databricks.sdk import WorkspaceClient

        client = WorkspaceClient(host=host, token=token)
        me = client.current_user.me()

        user_id = getattr(me, "id", None) or getattr(me, "user_name", "") or "unknown"
        email = getattr(me, "user_name", "") or ""
        display_name = getattr(me, "display_name", None) or email or "Unknown"

        return UserInfo(
            user_id=str(user_id),
            email=email,
            display_name=display_name,
        )
    except Exception as e:
        logger.warning("Token validation failed: %s", e, exc_info=False)
        return None


async def get_current_user(request: Request) -> UserInfo:
    """
    FastAPI dependency that extracts user identity from the request.

    In Databricks Apps, the Authorization: Bearer <token> header contains a
    Databricks OAuth token. We validate it via WorkspaceClient.current_user.me().

    In development mode (DATABRICKS_HOST not set), returns a default user.
    On token validation failure, logs a warning and returns the default user
    (does not block the app).
    """
    host = os.environ.get("DATABRICKS_HOST", "").strip()
    if not host:
        return _get_default_user()

    token = _extract_bearer_token(request)
    if not token:
        return _get_default_user()

    cached = _get_cached_user(token)
    if cached:
        return cached

    user_info = _fetch_user_from_databricks(token, host)
    if user_info:
        _set_cached_user(token, user_info)
        return user_info

    return _get_default_user()


# Type alias for dependency injection
CurrentUser = Annotated[UserInfo, Depends(get_current_user)]
