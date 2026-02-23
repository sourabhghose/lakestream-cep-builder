"""Unit tests for pipeline store (LocalFileStore)."""

from datetime import datetime

import pytest

from app.models.pipeline import PipelineDefinition, PipelineEdge, PipelineNode
from app.services.pipeline_store import LocalFileStore


def _make_pipeline(
    pipeline_id: str | None = None,
    name: str = "Test",
    nodes: list | None = None,
    edges: list | None = None,
) -> PipelineDefinition:
    nodes = nodes or [
        PipelineNode(id="n1", type="filter", config={}),
    ]
    edges = edges or []
    return PipelineDefinition(
        id=pipeline_id or "",
        name=name,
        description="",
        nodes=nodes,
        edges=edges,
    )


def test_save_and_get(pipeline_store: LocalFileStore):
    """Test LocalFileStore save and get."""
    pipeline = _make_pipeline(pipeline_id="p1", name="My Pipeline")
    saved_id = pipeline_store.save(pipeline)
    assert saved_id == "p1"

    retrieved = pipeline_store.get("p1")
    assert retrieved is not None
    assert retrieved.id == "p1"
    assert retrieved.name == "My Pipeline"
    assert len(retrieved.nodes) == 1


def test_save_assigns_uuid_when_no_id(pipeline_store: LocalFileStore):
    """Test that UUIDs are assigned to pipelines without IDs."""
    pipeline = _make_pipeline(pipeline_id="", name="No ID")
    saved_id = pipeline_store.save(pipeline)
    assert saved_id
    assert len(saved_id) == 36  # UUID format
    assert saved_id.count("-") == 4  # UUID has 4 hyphens

    retrieved = pipeline_store.get(saved_id)
    assert retrieved is not None
    assert retrieved.id == saved_id


def test_save_adds_timestamps(pipeline_store: LocalFileStore):
    """Test that timestamps are added on save."""
    pipeline = _make_pipeline(pipeline_id="p2", name="With Timestamps")
    pipeline_store.save(pipeline)

    retrieved = pipeline_store.get("p2")
    assert retrieved is not None
    assert retrieved.created_at is not None
    assert retrieved.updated_at is not None
    assert isinstance(retrieved.created_at, datetime)
    assert isinstance(retrieved.updated_at, datetime)


def test_list_all(pipeline_store: LocalFileStore):
    """Test list_all returns summaries sorted by updated_at."""
    pipeline_store.save(_make_pipeline(pipeline_id="p1", name="First"))
    pipeline_store.save(_make_pipeline(pipeline_id="p2", name="Second"))

    summaries = pipeline_store.list_all()
    assert len(summaries) == 2
    ids = [s.id for s in summaries]
    assert "p1" in ids
    assert "p2" in ids
    for s in summaries:
        assert s.node_count >= 0
        assert s.edge_count >= 0
        assert s.updated_at is not None


def test_list_all_empty(pipeline_store: LocalFileStore):
    """Test list_all when store is empty."""
    summaries = pipeline_store.list_all()
    assert summaries == []


def test_delete(pipeline_store: LocalFileStore):
    """Test delete removes pipeline."""
    pipeline_store.save(_make_pipeline(pipeline_id="p1", name="To Delete"))
    assert pipeline_store.get("p1") is not None

    result = pipeline_store.delete("p1")
    assert result is True
    assert pipeline_store.get("p1") is None


def test_delete_not_found(pipeline_store: LocalFileStore):
    """Test delete returns False when pipeline doesn't exist."""
    result = pipeline_store.delete("non-existent")
    assert result is False


def test_update(pipeline_store: LocalFileStore):
    """Test update modifies existing pipeline."""
    pipeline = _make_pipeline(pipeline_id="p1", name="Original")
    pipeline_store.save(pipeline)

    updated_pipeline = _make_pipeline(pipeline_id="p1", name="Updated", nodes=[
        PipelineNode(id="n1", type="filter", config={}),
        PipelineNode(id="n2", type="filter", config={}),
    ])
    result = pipeline_store.update("p1", updated_pipeline)

    assert result.name == "Updated"
    assert len(result.nodes) == 2
    assert result.version == 2
    assert result.id == "p1"

    retrieved = pipeline_store.get("p1")
    assert retrieved.name == "Updated"
    assert len(retrieved.nodes) == 2


def test_update_preserves_created_at(pipeline_store: LocalFileStore):
    """Test update preserves created_at timestamp."""
    pipeline = _make_pipeline(pipeline_id="p1", name="Original")
    pipeline_store.save(pipeline)
    original_created = pipeline_store.get("p1").created_at

    updated = _make_pipeline(pipeline_id="p1", name="Updated")
    pipeline_store.update("p1", updated)

    retrieved = pipeline_store.get("p1")
    assert retrieved.created_at == original_created
    updated_at = retrieved.updated_at.replace(tzinfo=None) if retrieved.updated_at else None
    created_at = original_created.replace(tzinfo=None) if original_created else None
    assert updated_at >= created_at


def test_update_not_found(pipeline_store: LocalFileStore):
    """Test update raises FileNotFoundError when pipeline doesn't exist."""
    pipeline = _make_pipeline(pipeline_id="p1", name="Test")
    with pytest.raises(FileNotFoundError):
        pipeline_store.update("non-existent", pipeline)
