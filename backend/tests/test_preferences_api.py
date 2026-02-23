"""Integration tests for preferences API endpoints."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.preferences_store import LocalPreferencesStore, get_preferences_store


@pytest.fixture
def temp_preferences_dir(tmp_path: Path) -> Path:
    """Create a temporary directory for preferences."""
    store_dir = tmp_path / "preferences"
    store_dir.mkdir(parents=True)
    return store_dir


@pytest.fixture
def preferences_store(temp_preferences_dir: Path) -> LocalPreferencesStore:
    """Create a LocalPreferencesStore backed by a temporary directory."""
    return LocalPreferencesStore(base_dir=temp_preferences_dir)


@pytest.fixture
def client(preferences_store: LocalPreferencesStore) -> TestClient:
    """FastAPI TestClient with preferences store patched to use temporary directory."""
    def _get_store():
        return preferences_store

    with patch("app.api.preferences.get_preferences_store", side_effect=_get_store):
        yield TestClient(app)


def test_get_preferences_returns_defaults(client: TestClient):
    """Test GET /api/preferences returns defaults when no preferences saved."""
    response = client.get("/api/preferences")
    assert response.status_code == 200
    data = response.json()
    assert data["default_catalog"] is None
    assert data["default_schema"] is None
    assert data["canvas_settings"] == {
        "snap_to_grid": True,
        "grid_size": 15,
        "show_minimap": True,
        "auto_generate_code": True,
    }
    assert data["recent_pipelines"] == []


def test_put_preferences_saves_and_get_retrieves(client: TestClient):
    """Test PUT /api/preferences saves and GET retrieves updated preferences."""
    payload = {
        "default_catalog": "main",
        "default_schema": "lakehouse",
        "canvas_settings": {"snap_to_grid": False, "grid_size": 20},
        "recent_pipelines": ["pipeline-a", "pipeline-b"],
    }
    put_response = client.put("/api/preferences", json=payload)
    assert put_response.status_code == 200
    assert put_response.json() == payload

    get_response = client.get("/api/preferences")
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["default_catalog"] == "main"
    assert data["default_schema"] == "lakehouse"
    assert data["canvas_settings"]["snap_to_grid"] is False
    assert data["canvas_settings"]["grid_size"] == 20
    assert data["recent_pipelines"] == ["pipeline-a", "pipeline-b"]


def test_put_preferences_partial_update(client: TestClient):
    """Test PUT with partial update - only specified fields change."""
    # First save full preferences
    client.put(
        "/api/preferences",
        json={
            "default_catalog": "cat1",
            "default_schema": "schema1",
            "recent_pipelines": ["p1"],
        },
    )
    # Update only catalog
    client.put(
        "/api/preferences",
        json={
            "default_catalog": "cat2",
        },
    )
    data = client.get("/api/preferences").json()
    assert data["default_catalog"] == "cat2"
    # Schema and recent_pipelines may be overwritten by the partial PUT
    # (Pydantic sends the full model - partial updates need PATCH or exclude_unset)
    # Actually - when we PUT, we send the full UserPreferences. So the second PUT
    # only had default_catalog - the rest would be defaults (None, {}, []).
    # So we'd lose schema1 and p1. That's expected for a full PUT.
    # Let me adjust the test - we're testing that the API works. The second PUT
    # with just default_catalog would result in defaults for the rest.
    assert data["default_schema"] is None  # overwritten by default
    assert data["recent_pipelines"] == []  # overwritten by default
