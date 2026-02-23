"""
User preferences persistence layer.

Supports LocalPreferencesStore (JSON files in ~/.lakestream/preferences/)
and LakebasePreferencesStore (PostgreSQL user_preferences table when PGHOST is set).
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from pathlib import Path

from app.models.preferences import UserPreferences


class PreferencesStore(ABC):
    """Abstract base class for preferences storage backends."""

    @abstractmethod
    def get(self, user_id: str) -> UserPreferences:
        """Get preferences for a user. Returns defaults if none saved."""
        ...

    @abstractmethod
    def save(self, user_id: str, preferences: UserPreferences) -> None:
        """Save preferences for a user."""
        ...


def _default_preferences() -> UserPreferences:
    """Return default preferences."""
    return UserPreferences()


class LocalPreferencesStore(PreferencesStore):
    """Stores preferences as JSON files in ~/.lakestream/preferences/."""

    def __init__(self, base_dir: str | Path | None = None):
        if base_dir is None:
            base_dir = Path.home() / ".lakestream" / "preferences"
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, user_id: str) -> Path:
        # Sanitize user_id for filename (replace problematic chars)
        safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_id)
        return self._base / f"{safe_id}.json"

    def get(self, user_id: str) -> UserPreferences:
        path = self._path(user_id)
        if not path.exists():
            return _default_preferences()
        with open(path) as f:
            data = json.load(f)
        return UserPreferences.model_validate(data)

    def save(self, user_id: str, preferences: UserPreferences) -> None:
        path = self._path(user_id)
        with open(path, "w") as f:
            json.dump(preferences.model_dump(mode="json"), f, indent=2)


class LakebasePreferencesStore(PreferencesStore):
    """Stores preferences in Lakebase PostgreSQL (user_preferences table)."""

    def __init__(self) -> None:
        from app.db import get_pool

        self._pool = get_pool()

    def get(self, user_id: str) -> UserPreferences:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT default_catalog, default_schema, canvas_settings, recent_pipelines
                    FROM user_preferences
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                row = cur.fetchone()
        if not row:
            return _default_preferences()
        default_catalog, default_schema, canvas_settings, recent_pipelines = row
        # recent_pipelines is UUID[] in PostgreSQL; convert to list[str]
        rp = [str(u) for u in (recent_pipelines or [])]
        cs = canvas_settings if isinstance(canvas_settings, dict) else (json.loads(canvas_settings) if canvas_settings else {})
        return UserPreferences(
            default_catalog=default_catalog,
            default_schema=default_schema,
            canvas_settings=cs,
            recent_pipelines=rp,
        )

    def save(self, user_id: str, preferences: UserPreferences) -> None:
        canvas_json = json.dumps(preferences.canvas_settings)
        recent_uuids = preferences.recent_pipelines  # list[str] - PostgreSQL accepts text[] or uuid[]
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO user_preferences (
                        user_id, default_catalog, default_schema,
                        canvas_settings, recent_pipelines, updated_at
                    ) VALUES (%s, %s, %s, %s::jsonb, %s::uuid[], now())
                    ON CONFLICT (user_id) DO UPDATE SET
                        default_catalog = EXCLUDED.default_catalog,
                        default_schema = EXCLUDED.default_schema,
                        canvas_settings = EXCLUDED.canvas_settings,
                        recent_pipelines = EXCLUDED.recent_pipelines,
                        updated_at = now()
                    """,
                    (
                        user_id,
                        preferences.default_catalog,
                        preferences.default_schema,
                        canvas_json,
                        recent_uuids,
                    ),
                )


def get_preferences_store() -> PreferencesStore:
    """Return LakebasePreferencesStore if PGHOST is set, otherwise LocalPreferencesStore."""
    if os.environ.get("PGHOST"):
        return LakebasePreferencesStore()
    return LocalPreferencesStore()
