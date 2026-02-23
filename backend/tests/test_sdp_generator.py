"""Unit tests for SDP (Lakeflow Declarative Pipelines) code generator."""

import pytest

from app.codegen.sdp_generator import generate_sdp
from app.models.pipeline import PipelineDefinition, PipelineEdge, PipelineNode


def _make_pipeline(nodes: list[PipelineNode], edges: list[PipelineEdge]) -> PipelineDefinition:
    return PipelineDefinition(
        id="test",
        name="Test",
        description="",
        nodes=nodes,
        edges=edges,
    )


def test_sdp_kafka_source():
    """Test SDP generation for kafka-topic source."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={"topic": "events"}),
        ],
        edges=[],
    )
    code = generate_sdp(pipeline)
    assert "kafka_read" in code or "kafka" in code.lower()
    assert "events" in code
    assert "CREATE OR REFRESH STREAMING TABLE" in code


def test_sdp_delta_table_source():
    """Test SDP generation for delta-table-source."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(
                id="delta-src-1",
                type="delta-table-source",
                config={"catalog": "main", "schema": "default", "table_name": "source"},
            ),
        ],
        edges=[],
    )
    code = generate_sdp(pipeline)
    assert "delta" in code.lower() or "stream" in code.lower()
    assert "main" in code or "default" in code
    assert "source" in code


def test_sdp_auto_loader():
    """Test SDP generation for auto-loader source."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(
                id="auto-1",
                type="auto-loader",
                config={"path": "/path/to/data", "format": "json"},
            ),
        ],
        edges=[],
    )
    code = generate_sdp(pipeline)
    assert "/path/to/data" in code or "path" in code.lower()
    assert "json" in code.lower() or "format" in code.lower()


def test_sdp_cdc_stream():
    """Test SDP generation for cdc-stream source."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(
                id="cdc-1",
                type="cdc-stream",
                config={"topic": "cdc_events"},
            ),
        ],
        edges=[],
    )
    code = generate_sdp(pipeline)
    assert "cdc" in code.lower() or "stream" in code.lower()


def test_sdp_filter():
    """Test SDP generation for filter transform."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(id="filter-1", type="filter", config={"condition": "value > 0"}),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="filter-1")],
    )
    code = generate_sdp(pipeline)
    assert "filter" in code.lower() or "WHERE" in code
    assert "value > 0" in code


def test_sdp_window_aggregate():
    """Test SDP generation for window-aggregate transform."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(
                id="agg-1",
                type="window-aggregate",
                config={
                    "window_duration": "10 minutes",
                    "aggregation": "COUNT(*) as cnt",
                },
            ),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="agg-1")],
    )
    code = generate_sdp(pipeline)
    assert "window" in code.lower()
    assert "10 minutes" in code or "minutes" in code
    assert "COUNT" in code or "aggregation" in code.lower()


def test_sdp_delta_sink():
    """Test SDP generation for delta-table-sink."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(
                id="delta-1",
                type="delta-table-sink",
                config={"catalog": "main", "schema": "default", "table_name": "output"},
            ),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="delta-1")],
    )
    code = generate_sdp(pipeline)
    assert "delta" in code.lower() or "streaming" in code.lower()
    assert "output" in code
    assert "CREATE OR REFRESH STREAMING TABLE" in code or "SELECT" in code


def test_sdp_full_pipeline():
    """Test SDP generation for kafka -> filter -> delta pipeline."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={"topic": "events"}),
            PipelineNode(id="filter-1", type="filter", config={"condition": "1=1"}),
            PipelineNode(id="delta-1", type="delta-table-sink", config={"table_name": "out"}),
        ],
        edges=[
            PipelineEdge(id="e1", source="kafka-1", target="filter-1"),
            PipelineEdge(id="e2", source="filter-1", target="delta-1"),
        ],
    )
    code = generate_sdp(pipeline)
    assert "kafka" in code.lower()
    assert "filter" in code.lower() or "WHERE" in code
    assert "delta" in code.lower() or "out" in code
