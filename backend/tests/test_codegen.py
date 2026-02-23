"""API tests for code generation endpoint."""

import pytest
from fastapi.testclient import TestClient


def test_codegen_sdp_pipeline(client: TestClient):
    """Test POST /api/codegen/generate with a simple SDP pipeline (kafka -> filter -> delta)."""
    pipeline = {
        "id": "p1",
        "name": "SDP Pipeline",
        "description": "Simple SDP",
        "nodes": [
            {"id": "kafka-1", "type": "kafka-topic", "config": {"topic": "events"}},
            {"id": "filter-1", "type": "filter", "config": {"condition": "1=1"}},
            {"id": "delta-1", "type": "delta-table-sink", "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "kafka-1", "target": "filter-1"},
            {"id": "e2", "source": "filter-1", "target": "delta-1"},
        ],
    }
    response = client.post("/api/codegen/generate", json=pipeline)
    assert response.status_code == 200
    data = response.json()
    assert data["code_target"] == "sdp"
    assert data["sdp_code"] is not None
    assert data["sss_code"] is None
    assert "sdp_code" in data


def test_codegen_cep_pipeline(client: TestClient):
    """Test POST /api/codegen/generate with CEP pipeline (kafka -> sequence-detector -> delta) -> SSS code."""
    pipeline = {
        "id": "p2",
        "name": "CEP Pipeline",
        "description": "Sequence detection",
        "nodes": [
            {"id": "kafka-1", "type": "kafka-topic", "config": {"topic": "events"}},
            {"id": "seq-1", "type": "sequence-detector", "config": {"pattern": "A -> B"}},
            {"id": "delta-1", "type": "delta-table-sink", "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "kafka-1", "target": "seq-1"},
            {"id": "e2", "source": "seq-1", "target": "delta-1"},
        ],
    }
    response = client.post("/api/codegen/generate", json=pipeline)
    assert response.status_code == 200
    data = response.json()
    # CEP nodes (sequence-detector) require SSS; kafka/delta are SDP_OR_SSS -> code_target can be "sss" or "hybrid"
    assert data["code_target"] in ("sss", "hybrid")
    assert data["sss_code"] is not None
    if data["code_target"] == "sss":
        assert data["sdp_code"] is None



def test_codegen_sdp_contains_sql(client: TestClient):
    """Test that SDP code contains expected SQL statements."""
    pipeline = {
        "id": "p3",
        "name": "SDP",
        "description": "",
        "nodes": [
            {"id": "kafka-1", "type": "kafka-topic", "config": {}},
            {"id": "filter-1", "type": "filter", "config": {}},
            {"id": "delta-1", "type": "delta-table-sink", "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "kafka-1", "target": "filter-1"},
            {"id": "e2", "source": "filter-1", "target": "delta-1"},
        ],
    }
    response = client.post("/api/codegen/generate", json=pipeline)
    assert response.status_code == 200
    sdp_code = response.json()["sdp_code"]
    assert "CREATE OR REFRESH STREAMING TABLE" in sdp_code or "kafka_read" in sdp_code
    assert "SELECT" in sdp_code
    assert "delta" in sdp_code.lower() or "streaming" in sdp_code.lower()


def test_codegen_sss_contains_python_imports(client: TestClient):
    """Test that SSS code contains expected Python imports."""
    pipeline = {
        "id": "p4",
        "name": "CEP",
        "description": "",
        "nodes": [
            {"id": "kafka-1", "type": "kafka-topic", "config": {}},
            {"id": "seq-1", "type": "sequence-detector", "config": {}},
            {"id": "delta-1", "type": "delta-table-sink", "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "kafka-1", "target": "seq-1"},
            {"id": "e2", "source": "seq-1", "target": "delta-1"},
        ],
    }
    response = client.post("/api/codegen/generate", json=pipeline)
    assert response.status_code == 200
    sss_code = response.json()["sss_code"]
    assert "from pyspark" in sss_code or "import" in sss_code
    assert "TransformWithState" in sss_code or "readStream" in sss_code


def test_codegen_invalid_pipeline(client: TestClient):
    """Test codegen with invalid pipeline (e.g., cycle) returns 400."""
    pipeline = {
        "id": "p5",
        "name": "Invalid",
        "description": "",
        "nodes": [
            {"id": "a", "type": "filter", "config": {}},
            {"id": "b", "type": "filter", "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b"},
            {"id": "e2", "source": "b", "target": "a"},  # cycle
        ],
    }
    response = client.post("/api/codegen/generate", json=pipeline)
    assert response.status_code == 400
