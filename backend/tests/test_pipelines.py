"""API tests for pipeline CRUD endpoints."""

import uuid

import pytest
from fastapi.testclient import TestClient


def test_create_pipeline(client: TestClient, sample_create_request: dict):
    """Test POST /api/pipelines - create pipeline, verify UUID and timestamps."""
    response = client.post("/api/pipelines", json=sample_create_request)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    # Verify UUID format
    parsed = uuid.UUID(data["id"])
    assert str(parsed) == data["id"]
    assert data["name"] == sample_create_request["name"]
    assert data["description"] == sample_create_request["description"]
    assert "created_at" in data
    assert "updated_at" in data
    # Nodes may have default position/label added by Pydantic
    assert len(data["nodes"]) == len(sample_create_request["nodes"])
    for i, node in enumerate(data["nodes"]):
        assert node["id"] == sample_create_request["nodes"][i]["id"]
        assert node["type"] == sample_create_request["nodes"][i]["type"]
        assert node["config"] == sample_create_request["nodes"][i]["config"]
    assert len(data["edges"]) == len(sample_create_request["edges"])
    assert data["version"] == 1
    assert data["status"] == "draft"


def test_list_pipelines_empty(client: TestClient):
    """Test GET /api/pipelines - list pipelines when empty."""
    response = client.get("/api/pipelines")
    assert response.status_code == 200
    assert response.json() == []


def test_list_pipelines(client: TestClient, sample_create_request: dict):
    """Test GET /api/pipelines - list pipelines after creating one."""
    create_resp = client.post("/api/pipelines", json=sample_create_request)
    assert create_resp.status_code == 200
    pipeline_id = create_resp.json()["id"]

    response = client.get("/api/pipelines")
    assert response.status_code == 200
    pipelines = response.json()
    assert len(pipelines) == 1
    assert pipelines[0]["id"] == pipeline_id
    assert pipelines[0]["name"] == sample_create_request["name"]
    assert "node_count" in pipelines[0]
    assert "edge_count" in pipelines[0]


def test_get_pipeline_by_id(client: TestClient, sample_create_request: dict):
    """Test GET /api/pipelines/{id} - get pipeline by ID."""
    create_resp = client.post("/api/pipelines", json=sample_create_request)
    assert create_resp.status_code == 200
    pipeline_id = create_resp.json()["id"]

    response = client.get(f"/api/pipelines/{pipeline_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == pipeline_id
    assert data["name"] == sample_create_request["name"]
    assert len(data["nodes"]) == 3
    assert len(data["edges"]) == 2


def test_get_pipeline_not_found(client: TestClient):
    """Test GET /api/pipelines/{id} - 404 when pipeline does not exist."""
    response = client.get("/api/pipelines/non-existent-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_update_pipeline(client: TestClient, sample_create_request: dict):
    """Test PUT /api/pipelines/{id} - update pipeline."""
    create_resp = client.post("/api/pipelines", json=sample_create_request)
    assert create_resp.status_code == 200
    pipeline_id = create_resp.json()["id"]

    update_payload = {"name": "Updated Name", "description": "Updated description"}
    response = client.put(f"/api/pipelines/{pipeline_id}", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["description"] == "Updated description"
    assert data["id"] == pipeline_id
    assert data["version"] == 2


def test_update_pipeline_not_found(client: TestClient):
    """Test PUT /api/pipelines/{id} - 404 when pipeline does not exist."""
    response = client.put(
        "/api/pipelines/non-existent-id",
        json={"name": "Updated"},
    )
    assert response.status_code == 404


def test_delete_pipeline(client: TestClient, sample_create_request: dict):
    """Test DELETE /api/pipelines/{id} - delete pipeline."""
    create_resp = client.post("/api/pipelines", json=sample_create_request)
    assert create_resp.status_code == 200
    pipeline_id = create_resp.json()["id"]

    response = client.delete(f"/api/pipelines/{pipeline_id}")
    assert response.status_code == 204

    # Verify it's gone
    get_resp = client.get(f"/api/pipelines/{pipeline_id}")
    assert get_resp.status_code == 404


def test_delete_pipeline_not_found(client: TestClient):
    """Test DELETE /api/pipelines/{id} - 404 when pipeline does not exist."""
    response = client.delete("/api/pipelines/non-existent-id")
    assert response.status_code == 404
