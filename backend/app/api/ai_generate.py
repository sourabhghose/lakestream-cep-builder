"""
AI-powered pipeline generation using Databricks Foundation Model APIs.

Accepts a natural language prompt and returns a pipeline graph
(nodes + edges) that can be loaded directly onto the canvas.
"""

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.nodes import NODE_REGISTRY, NodeCategory

AI_MODEL_ENDPOINT = os.environ.get(
    "AI_MODEL_ENDPOINT", "databricks-claude-sonnet-4-6"
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _build_node_catalog() -> str:
    """Build a compact node catalog string for the LLM system prompt."""
    categories: dict[str, list[str]] = {
        "source": [],
        "cep_pattern": [],
        "transform": [],
        "sink": [],
    }
    for node_type, meta in NODE_REGISTRY.items():
        categories[meta["category"].value].append(node_type)

    lines = []
    for cat, types in categories.items():
        lines.append(f"## {cat} ({len(types)} types)")
        for t in types:
            lines.append(f"  - {t}")
    return "\n".join(lines)


NODE_CATALOG = _build_node_catalog()

SYSTEM_PROMPT = f"""You are an expert streaming data architect for Databricks. You design Complex Event Processing (CEP) pipelines.

Given a user's natural language description, generate a pipeline as a JSON object with "nodes" and "edges" arrays.

## Available Node Types (48 total)
{NODE_CATALOG}

## Output Format
Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{{
  "name": "Pipeline Name",
  "description": "Brief description",
  "nodes": [
    {{
      "id": "unique-node-id",
      "type": "<node-type from catalog above>",
      "x": <integer x position>,
      "y": <integer y position>,
      "label": "Human-readable label",
      "config": {{ <node-specific configuration> }}
    }}
  ],
  "edges": [
    {{
      "source": "<source-node-id>",
      "target": "<target-node-id>"
    }}
  ]
}}

## Layout Rules
- Sources at x=0, with different y values (spaced 150px apart)
- Transforms/CEP patterns in the middle (x=300, 600, etc.)
- Sinks at the rightmost column
- Space nodes 150px apart vertically
- Use descriptive IDs like "kafka-orders", "filter-high-value", "delta-sink-alerts"

## Config Guidelines
- For kafka-topic: include bootstrapServers, topics, consumerGroup, startingOffset, deserializationFormat
- For filter: include condition (SQL WHERE expression)
- For window-aggregate: include windowType, windowDuration, aggregations, groupByColumns
- For delta-table-sink: include catalog, schema, table, writeMode
- For sequence-detector: include steps (JSON array), contiguityMode, withinDuration
- For absence-detector: include triggerEventFilter, expectedEventFilter, timeoutDuration
- For count-threshold: include countColumn, threshold, windowDuration
- For stream-simulator: include dataProfile (iot-sensors, clickstream, financial-transactions, ecommerce-orders), eventsPerSecond
- For email-sink: include smtpProvider, to, subjectTemplate, bodyTemplate
- For slack-teams-pagerduty: include webhookUrl, channel, messageTemplate
- Always provide realistic, meaningful configuration values
- Durations use {{value, unit}} format: {{"value": 5, "unit": "minutes"}}

## Important
- Every pipeline MUST have at least one source and one sink
- Each transform/sink node should have exactly one input (except union-merge which can have 2-8)
- CEP patterns require SSS code target — that's fine, the system handles it
- Generate 3-10 nodes typically
- Ensure the graph is a DAG (no cycles)
"""


class GenerateRequest(BaseModel):
    prompt: str


class GenerateResponse(BaseModel):
    name: str
    description: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


def _call_foundation_model(prompt: str) -> dict:
    """Call Databricks Foundation Model API to generate a pipeline.

    Uses the serving endpoint specified by AI_MODEL_ENDPOINT env var
    (default: databricks-claude-sonnet-4-6). Works with any workspace
    that has the endpoint enabled — no host or token hardcoded.
    """
    try:
        from databricks.sdk import WorkspaceClient

        w = WorkspaceClient()
        logger.info("Calling model endpoint: %s", AI_MODEL_ENDPOINT)
        response = w.serving_endpoints.query(
            name=AI_MODEL_ENDPOINT,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=4096,
            temperature=0.3,
        )

        content = response.choices[0].message.content
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        return json.loads(content)

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Databricks SDK not available. AI generation requires deployment as a Databricks App.",
        )
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM response as JSON: %s", e)
        raise HTTPException(
            status_code=502,
            detail="AI model returned invalid JSON. Please try rephrasing your prompt.",
        )
    except Exception as e:
        error_msg = str(e)
        logger.error("Foundation Model API call failed: %s", error_msg)
        if "RESOURCE_DOES_NOT_EXIST" in error_msg or "NOT_FOUND" in error_msg:
            raise HTTPException(
                status_code=503,
                detail=f"Model endpoint '{AI_MODEL_ENDPOINT}' not available in this workspace. "
                       f"Set AI_MODEL_ENDPOINT env var or enable the endpoint under AI/BI > Foundation Models.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"AI generation failed: {error_msg[:200]}",
        )


def _validate_and_normalize(raw: dict) -> GenerateResponse:
    """Validate and normalize the LLM output into canvas-compatible format."""
    name = raw.get("name", "AI-Generated Pipeline")
    description = raw.get("description", "")
    raw_nodes = raw.get("nodes", [])
    raw_edges = raw.get("edges", [])

    if not raw_nodes:
        raise HTTPException(status_code=422, detail="AI generated an empty pipeline. Try a more specific prompt.")

    valid_types = set(NODE_REGISTRY.keys())
    nodes = []
    node_ids = set()

    for i, n in enumerate(raw_nodes):
        node_id = n.get("id", f"node-{i}")
        node_type = n.get("type", "")

        if node_type not in valid_types:
            logger.warning("AI generated unknown node type '%s', skipping", node_type)
            continue

        node_ids.add(node_id)
        nodes.append({
            "id": node_id,
            "type": node_type,
            "x": n.get("x", i * 300),
            "y": n.get("y", 0),
            "label": n.get("label", node_id),
            "config": n.get("config", {}),
        })

    edges = []
    for e in raw_edges:
        src = e.get("source", "")
        tgt = e.get("target", "")
        if src in node_ids and tgt in node_ids:
            edges.append({
                "source": src,
                "target": tgt,
            })

    has_source = any(
        NODE_REGISTRY.get(n["type"], {}).get("category") == NodeCategory.SOURCE
        for n in nodes
    )
    has_sink = any(
        NODE_REGISTRY.get(n["type"], {}).get("category") == NodeCategory.SINK
        for n in nodes
    )

    if not has_source:
        logger.warning("AI pipeline missing source — adding stream-simulator")
        nodes.insert(0, {
            "id": "auto-source",
            "type": "stream-simulator",
            "x": 0,
            "y": 0,
            "label": "Stream Simulator",
            "config": {"dataProfile": "iot-sensors", "eventsPerSecond": 10},
        })
        if nodes[1:]:
            edges.insert(0, {"source": "auto-source", "target": nodes[1]["id"]})

    if not has_sink:
        logger.warning("AI pipeline missing sink — adding delta-table-sink")
        last_node = nodes[-1]
        sink_node = {
            "id": "auto-sink",
            "type": "delta-table-sink",
            "x": last_node["x"] + 300,
            "y": last_node["y"],
            "label": "Delta Table Output",
            "config": {"catalog": "main", "schema": "default", "table": "ai_pipeline_output", "writeMode": "append"},
        }
        nodes.append(sink_node)
        edges.append({"source": last_node["id"], "target": "auto-sink"})

    return GenerateResponse(
        name=name,
        description=description,
        nodes=nodes,
        edges=edges,
    )


@router.post("/generate")
async def generate_pipeline(req: GenerateRequest) -> GenerateResponse:
    """Generate a CEP pipeline from a natural language description using AI."""
    if not req.prompt or len(req.prompt.strip()) < 10:
        raise HTTPException(status_code=400, detail="Prompt must be at least 10 characters.")

    logger.info("AI pipeline generation requested: %s", req.prompt[:100])
    raw = _call_foundation_model(req.prompt.strip())
    result = _validate_and_normalize(raw)
    logger.info("AI generated pipeline '%s' with %d nodes, %d edges", result.name, len(result.nodes), len(result.edges))
    return result
