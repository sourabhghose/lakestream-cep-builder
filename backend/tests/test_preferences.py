"""Tests for preferences store service."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.models.preferences import UserPreferences
from app.services.preferences_store import (
    LocalPreferencesStore,
    get_preferences_store,
)


@pytest.fixture
def preferences_dir(tmp_path: Path) -> Path:
    """Create a temporary directory for preferences."""
    store_dir = tmp_path / "preferences"
    store_dir.mkdir(parents=True)
    return store_dir


@pytest.fixture
def preferences_store(preferences_dir: Path) -> LocalPreferencesStore:
    """Create a LocalPreferencesStore backed by a temporary directory."""
    return LocalPreferencesStore(base_dir=preferences_dir)


def test_get_returns_defaults_when_no_preferences_saved(
    preferences_store: LocalPreferencesStore,
):
    """Test GET returns defaults when no preferences saved."""
    prefs = preferences_store.get("user-123")
    assert prefs.default_catalog is None
    assert prefs.default_schema is None
    assert prefs.canvas_settings == {
        "snap_to_grid": True,
        "grid_size": 15,
        "show_minimap": True,
        "auto_generate_code": True,
    }
    assert prefs.recent_pipelines == []


def test_put_saves_and_get_retrieves(preferences_store: LocalPreferencesStore):
    """Test PUT saves and GET retrieves updated preferences."""
    user_id = "user-456"
    updated = UserPreferences(
        default_catalog="main",
        default_schema="lakehouse",
        canvas_settings={"snap_to_grid": False, "grid_size": 20},
        recent_pipelines=["pipeline-1", "pipeline-2"],
    )
    preferences_store.save(user_id, updated)
    retrieved = preferences_store.get(user_id)
    assert retrieved.default_catalog == "main"
    assert retrieved.default_schema == "lakehouse"
    assert retrieved.canvas_settings["snap_to_grid"] is False
    assert retrieved.canvas_settings["grid_size"] == 20
    assert retrieved.recent_pipelines == ["pipeline-1", "pipeline-2"]


def test_recent_pipelines_maintained(preferences_store: LocalPreferencesStore):
    """Test that recent_pipelines list is correctly maintained."""
    user_id = "user-789"
    # Save with some recent pipelines
    prefs1 = UserPreferences(
        recent_pipelines=["p1", "p2", "p3"],
    )
    preferences_store.save(user_id, prefs1)
    retrieved = preferences_store.get(user_id)
    assert retrieved.recent_pipelines == ["p1", "p2", "p3"]
    # Update with different recent pipelines
    prefs2 = UserPreferences(
        default_catalog="cat",
        recent_pipelines=["p4", "p1", "p5"],
    )
    preferences_store.save(user_id, prefs2)
    retrieved2 = preferences_store.get(user_id)
    assert retrieved2.recent_pipelines == ["p4", "p1", "p5"]
    assert retrieved2.default_catalog == "cat"


def test_get_preferences_store_returns_local_when_no_pghost(monkeypatch):
    """Test get_preferences_store returns LocalPreferencesStore when PGHOST not set."""
    monkeypatch.delenv("PGHOST", raising=False)
    store = get_preferences_store()
    assert isinstance(store, LocalPreferencesStore)
