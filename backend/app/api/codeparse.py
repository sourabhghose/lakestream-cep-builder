"""
Code parse API router.

Parses SDP SQL code and returns a best-effort pipeline definition (nodes + edges).
"""

import re
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.pipeline import PipelineEdge, PipelineNode

router = APIRouter()


class ParseRequest(BaseModel):
    """Request body for code parse endpoint."""

    code: str = Field(..., description="SDP SQL code text to parse")


class ParseResponse(BaseModel):
    """Response from code parse endpoint."""

    nodes: list[PipelineNode] = Field(default_factory=list, description="Parsed pipeline nodes")
    edges: list[PipelineEdge] = Field(default_factory=list, description="Parsed pipeline edges")
    warnings: list[str] = Field(default_factory=list, description="Parse warnings")


def _parse_sdp_sql(code: str) -> tuple[list[PipelineNode], list[PipelineEdge], list[str]]:
    """
    Best-effort parse of SDP SQL into nodes and edges.

    Looks for:
    - CREATE OR REFRESH STREAMING TABLE <name> -> nodes
    - FROM stream(TABLE(kafka_read(...))) -> kafka-topic source
    - FROM <table> -> connects upstream to downstream
    - WHERE <condition> -> filter transform
    - GROUP BY -> aggregate transform
    - JOIN -> join transform
    - catalog.schema.table as sink target -> delta-table-sink
    """
    nodes: list[PipelineNode] = []
    edges: list[PipelineEdge] = []
    warnings: list[str] = []
    table_to_node: dict[str, str] = {}  # table name -> node id

    # Normalize: collapse whitespace, handle multi-line
    normalized = re.sub(r"\s+", " ", code.strip())
    normalized = " " + normalized + " "

    # Find all CREATE OR REFRESH STREAMING TABLE statements
    create_pattern = re.compile(
        r"CREATE\s+OR\s+REFRESH\s+STREAMING\s+TABLE\s+([a-zA-Z0-9_.]+)\s+AS\s+SELECT\s+(.*?)(?=CREATE\s+OR\s+REFRESH\s+STREAMING\s+TABLE|$)",
        re.IGNORECASE | re.DOTALL,
    )
    matches = list(create_pattern.finditer(code))

    for m in matches:
        target_name = m.group(1).strip()
        body = m.group(2).strip()

        # Determine node type and config from body
        node_id = target_name.replace(".", "_").replace("-", "_")
        if "." in target_name:
            # catalog.schema.table -> likely a sink
            node_id = target_name.split(".")[-1] + "_sink"

        body_lower = body.lower()
        from_match = re.search(r"\bFROM\s+([^\s;]+)", body, re.IGNORECASE)
        from_clause = from_match.group(1).strip() if from_match else ""

        # Check for kafka_read (source)
        if "kafka_read" in body_lower or ("stream(" in body_lower and "kafka" in body_lower):
            quoted = re.findall(r'["\']([^"\']*)["\']', body)
            bootstrap = quoted[0] if len(quoted) > 0 else "localhost:9092"
            topic = quoted[1] if len(quoted) > 1 else "events"
            node_type = "kafka-topic"
            config: dict[str, Any] = {
                "bootstrapServers": bootstrap,
                "topics": topic,
                "consumerGroup": "parsed-consumer",
                "startingOffset": "latest",
                "schemaSource": "infer",
                "deserializationFormat": "json",
            }
        # Check for sink (catalog.schema.table as target)
        elif "." in target_name and target_name.count(".") >= 2:
            parts = target_name.split(".")
            node_type = "delta-table-sink"
            config = {
                "catalog": parts[0],
                "schema": parts[1],
                "table": parts[2],
                "writeMode": "append",
            }
        # Check for JOIN (stream-stream-join)
        elif " join " in body_lower:
            join_match = re.search(r"FROM\s+(\w+)\s+\w+\s+JOIN\s+(\w+)\s+\w+", body, re.IGNORECASE)
            if join_match:
                stream_a = join_match.group(1)
                stream_b = join_match.group(2)
                node_type = "stream-stream-join"
                config = {
                    "joinCondition": "left.key = right.key",
                    "joinType": "inner",
                    "leftWatermark": {"value": 10, "unit": "minutes"},
                    "rightWatermark": {"value": 10, "unit": "minutes"},
                }
                nodes.append(
                    PipelineNode(
                        id=node_id,
                        type=node_type,
                        position={"x": 0, "y": 0},
                        config=config,
                        label=node_id,
                    )
                )
                if stream_a in table_to_node:
                    edges.append(
                        PipelineEdge(
                            id=f"e-{table_to_node[stream_a]}-{node_id}",
                            source=table_to_node[stream_a],
                            target=node_id,
                        )
                    )
                if stream_b in table_to_node:
                    edges.append(
                        PipelineEdge(
                            id=f"e-{table_to_node[stream_b]}-{node_id}",
                            source=table_to_node[stream_b],
                            target=node_id,
                        )
                    )
                table_to_node[target_name] = node_id
            continue
        # Check for GROUP BY (window-aggregate)
        elif "group by" in body_lower:
            node_type = "window-aggregate"
            config = {
                "windowType": "tumbling",
                "duration": {"value": 5, "unit": "minutes"},
                "aggregations": [{"column": "*", "function": "count"}],
            }
        # Check for WHERE (filter)
        elif " where " in body_lower:
            where_match = re.search(r"\bWHERE\s+(.+?)(?:\s+GROUP\s+BY|\s*$)", body, re.IGNORECASE | re.DOTALL)
            condition = where_match.group(1).strip() if where_match else "1=1"
            if len(condition) > 200:
                condition = condition[:200] + "..."
            node_type = "filter"
            config = {"condition": condition}
        # Default: map-select (simple SELECT FROM)
        else:
            node_type = "map-select"
            config = {"outputColumns": ["*"]}

        nodes.append(
            PipelineNode(
                id=node_id,
                type=node_type,
                position={"x": 0, "y": 0},
                config=config,
                label=node_id,
            )
        )
        table_to_node[target_name] = node_id

        # Extract FROM clause for edge (single table)
        if from_clause and "join" not in body_lower:
            # Skip FROM stream(TABLE(...)) - that's a source, not a table reference
            if not from_clause.strip().lower().startswith("stream("):
                from_table = from_clause.split()[0] if from_clause else ""
                if from_table and from_table.lower() not in ("stream", "table"):
                    if from_table in table_to_node:
                        edges.append(
                            PipelineEdge(
                                id=f"e-{table_to_node[from_table]}-{node_id}",
                                source=table_to_node[from_table],
                                target=node_id,
                            )
                        )
                    else:
                        warnings.append(f"Unknown upstream table '{from_table}' for node '{node_id}'")

    if not nodes and code.strip():
        warnings.append("No CREATE OR REFRESH STREAMING TABLE statements found")

    return nodes, edges, warnings


@router.post("/parse", response_model=ParseResponse)
async def parse_code(request: ParseRequest) -> ParseResponse:
    """
    Parse SDP SQL code and return a best-effort pipeline definition.

    Returns nodes, edges, and any warnings about unparseable parts.
    """
    nodes, edges, warnings = _parse_sdp_sql(request.code)
    return ParseResponse(nodes=nodes, edges=edges, warnings=warnings)
