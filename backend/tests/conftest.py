"""
Pytest configuration and shared fixtures for backend tests.

Provides TestClient, temporary pipeline store, and sample pipeline fixtures.
"""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.pipeline import (
    PipelineCreateRequest,
    PipelineDefinition,
    PipelineEdge,
    PipelineNode,
)
from app.services.pipeline_store import LocalFileStore, get_pipeline_store


@pytest.fixture
def temp_store_dir(tmp_path: Path) -> Path:
    """Create a temporary directory for LocalFileStore."""
    store_dir = tmp_path / "pipelines"
    store_dir.mkdir(parents=True)
    return store_dir


@pytest.fixture
def pipeline_store(temp_store_dir: Path) -> LocalFileStore:
    """Create a LocalFileStore backed by a temporary directory."""
    return LocalFileStore(base_dir=temp_store_dir)


@pytest.fixture
def client(pipeline_store: LocalFileStore):
    """
    FastAPI TestClient with pipeline store patched to use temporary directory.

    Patches get_pipeline_store in both pipelines and deploy API modules.
    """
    def _get_store():
        return pipeline_store

    with (
        patch("app.api.pipelines.get_pipeline_store", side_effect=_get_store),
        patch("app.api.deploy.get_pipeline_store", side_effect=_get_store),
    ):
        yield TestClient(app)


@pytest.fixture
def sample_pipeline() -> PipelineDefinition:
    """Sample pipeline: kafka -> filter -> delta sink (SDP-compatible)."""
    return PipelineDefinition(
        id="test-pipeline-123",
        name="Test Pipeline",
        description="A simple test pipeline",
        nodes=[
            PipelineNode(
                id="kafka-1",
                type="kafka-topic",
                config={"bootstrap_servers": "localhost:9092", "topic": "events"},
            ),
            PipelineNode(
                id="filter-1",
                type="filter",
                config={"condition": "value IS NOT NULL"},
            ),
            PipelineNode(
                id="delta-1",
                type="delta-table-sink",
                config={"table_name": "output_table"},
            ),
        ],
        edges=[
            PipelineEdge(id="e1", source="kafka-1", target="filter-1"),
            PipelineEdge(id="e2", source="filter-1", target="delta-1"),
        ],
    )


@pytest.fixture
def sample_cep_pipeline() -> PipelineDefinition:
    """Sample CEP pipeline: kafka -> sequence-detector -> delta (SSS-only)."""
    return PipelineDefinition(
        id="cep-pipeline-456",
        name="CEP Pipeline",
        description="Sequence detection pipeline",
        nodes=[
            PipelineNode(
                id="kafka-1",
                type="kafka-topic",
                config={"bootstrap_servers": "localhost:9092", "topic": "events"},
            ),
            PipelineNode(
                id="seq-1",
                type="sequence-detector",
                config={"pattern": "A -> B -> C", "timeout_seconds": 60},
            ),
            PipelineNode(
                id="delta-1",
                type="delta-table-sink",
                config={"table_name": "sequences"},
            ),
        ],
        edges=[
            PipelineEdge(id="e1", source="kafka-1", target="seq-1"),
            PipelineEdge(id="e2", source="seq-1", target="delta-1"),
        ],
    )


@pytest.fixture
def sample_create_request() -> dict:
    """Sample pipeline create request payload."""
    return {
        "name": "New Pipeline",
        "description": "Created via API",
        "nodes": [
            {
                "id": "kafka-1",
                "type": "kafka-topic",
                "config": {"topic": "test"},
            },
            {
                "id": "filter-1",
                "type": "filter",
                "config": {"condition": "1=1"},
            },
            {
                "id": "delta-1",
                "type": "delta-table-sink",
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "kafka-1", "target": "filter-1"},
            {"id": "e2", "source": "filter-1", "target": "delta-1"},
        ],
    }
