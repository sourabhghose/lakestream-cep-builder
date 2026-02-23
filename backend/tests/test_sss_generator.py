"""Unit tests for SSS (Spark Structured Streaming) code generator."""

import pytest

from app.codegen.sss_generator import generate_sss
from app.models.pipeline import PipelineDefinition, PipelineEdge, PipelineNode


def _make_pipeline(nodes: list[PipelineNode], edges: list[PipelineEdge]) -> PipelineDefinition:
    return PipelineDefinition(
        id="test",
        name="Test",
        description="",
        nodes=nodes,
        edges=edges,
    )


def test_sss_kafka_source():
    """Test SSS generation for kafka source."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={"topic": "events"}),
        ],
        edges=[],
    )
    code = generate_sss(pipeline)
    assert "readStream" in code
    assert "kafka" in code.lower()
    assert "events" in code
    assert "df_kafka_1" in code


def test_sss_sequence_detector_transform_with_state():
    """Test SSS generation for sequence-detector - verify TransformWithState appears."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(
                id="seq-1",
                type="sequence-detector",
                config={"pattern": "A -> B -> C", "timeout_seconds": 60},
            ),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="seq-1")],
    )
    code = generate_sss(pipeline)
    assert "TransformWithState" in code or "applyInPandasWithState" in code
    assert "sequence" in code.lower()
    assert "seq-1" in code or "seq_1" in code
    assert "60" in code


def test_sss_absence_detector():
    """Test SSS generation for absence-detector."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(
                id="abs-1",
                type="absence-detector",
                config={"expected_event": "heartbeat", "absence_timeout_seconds": 300},
            ),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="abs-1")],
    )
    code = generate_sss(pipeline)
    assert "absence" in code.lower()
    assert "heartbeat" in code
    assert "300" in code


def test_sss_filter():
    """Test SSS generation for filter."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(id="filter-1", type="filter", config={"condition": "value IS NOT NULL"}),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="filter-1")],
    )
    code = generate_sss(pipeline)
    assert ".filter(" in code
    assert "value IS NOT NULL" in code


def test_sss_delta_sink():
    """Test SSS generation for delta sink."""
    pipeline = _make_pipeline(
        nodes=[
            PipelineNode(id="kafka-1", type="kafka-topic", config={}),
            PipelineNode(id="delta-1", type="delta-table-sink", config={"table_name": "output"}),
        ],
        edges=[PipelineEdge(id="e1", source="kafka-1", target="delta-1")],
    )
    code = generate_sss(pipeline)
    assert "writeStream" in code
    assert "delta" in code.lower()
    assert "output" in code or "table" in code.lower()
