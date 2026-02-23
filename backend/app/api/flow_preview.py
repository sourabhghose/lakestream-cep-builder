"""
Flow preview API router.

Returns flow-through sample data: data flows from sources through each node
in topological order, with each node transforming its upstream output.
"""

import json
import random
import string
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.codegen.graph_utils import get_upstream_nodes, topological_sort
from app.models.pipeline import PipelineEdge, PipelineNode

router = APIRouter()


class FlowPreviewRequest(BaseModel):
    """Request body for flow preview endpoint."""

    pipeline: dict[str, Any] = Field(
        ...,
        description="Pipeline definition with nodes and edges",
    )


class FlowPreviewResponse(BaseModel):
    """Response with per-node preview data."""

    node_previews: dict[str, dict[str, Any]] = Field(
        ...,
        description="Map of node_id -> { columns, rows }",
    )


def _random_string(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def _random_timestamp() -> str:
    base = datetime.utcnow() - timedelta(days=1)
    delta = timedelta(seconds=random.randint(0, 86400))
    return (base + delta).isoformat() + "Z"


def _get_node_by_id(pipeline: dict, node_id: str) -> dict | None:
    for n in pipeline.get("nodes", []):
        if n.get("id") == node_id:
            return n
    return None


def _get_node_category(node_type: str) -> str:
    source_types = {
        "kafka-topic", "delta-table-source", "auto-loader", "rest-webhook-source",
        "cdc-stream", "event-hub-kinesis", "mqtt", "custom-python-source",
    }
    sink_types = {
        "delta-table-sink", "kafka-topic-sink", "rest-webhook-sink",
        "slack-teams-pagerduty", "email-sink", "sql-warehouse-sink",
        "unity-catalog-table-sink", "dead-letter-queue",
    }
    pattern_types = {
        "sequence-detector", "absence-detector", "count-threshold", "velocity-detector",
        "geofence-location", "temporal-correlation", "trend-detector", "outlier-anomaly",
        "session-detector", "deduplication", "match-recognize-sql", "custom-stateful-processor",
    }
    if node_type in source_types:
        return "source"
    if node_type in sink_types:
        return "sink"
    if node_type in pattern_types:
        return "cep-pattern"
    return "transform"


def _generate_source_sample(node_type: str, config: dict) -> tuple[list[str], list[list[Any]]]:
    """Generate synthetic sample for source nodes (5 rows)."""
    if node_type in ("kafka-topic", "kafka-topic-sink", "cdc-stream", "event-hub-kinesis", "mqtt"):
        topic = config.get("topics", config.get("topic", "sample-topic"))
        if isinstance(topic, str) and "," in topic:
            topic = topic.split(",")[0].strip()
        columns = ["key", "value", "timestamp", "topic"]
        rows = []
        for i in range(5):
            rows.append([
                f"key-{_random_string(6)}",
                json.dumps({"id": i + 1, "event_type": "sample", "amount": random.randint(10, 100)}),
                _random_timestamp(),
                topic,
            ])
        return columns, rows

    if node_type in ("delta-table-source", "auto-loader", "delta-table-sink", "unity-catalog-table-sink"):
        columns = ["id", "event_type", "amount", "timestamp", "partition_key"]
        rows = []
        for i in range(5):
            rows.append([
                f"rec-{i + 1}",
                random.choice(["A", "B", "C"]),
                random.randint(10, 500),
                _random_timestamp(),
                _random_string(4),
            ])
        return columns, rows

    if node_type in ("rest-webhook-source", "rest-webhook-sink"):
        columns = ["id", "payload", "received_at", "source"]
        rows = []
        for i in range(5):
            rows.append([
                f"req-{i + 1}",
                json.dumps({"event": f"event_{i}", "value": random.randint(1, 100)}),
                _random_timestamp(),
                "webhook",
            ])
        return columns, rows

    columns = ["id", "value", "timestamp"]
    rows = [[f"row-{i + 1}", random.randint(1, 100), _random_timestamp()] for i in range(5)]
    return columns, rows


def _apply_filter(columns: list[str], rows: list[list[Any]], condition: str) -> list[list[Any]]:
    """Filter rows by condition (simple regex/contains check)."""
    if not condition or not rows:
        return rows[:5]
    filtered = []
    cond_lower = condition.lower()
    for row in rows:
        row_dict = dict(zip(columns, row))
        try:
            keep = True
            if ">" in condition:
                for col in columns:
                    if col in condition and col in row_dict:
                        val = row_dict[col]
                        if isinstance(val, (int, float)):
                            rest = condition.split(">", 1)[1]
                            threshold = float("".join(c for c in rest if c.isdigit() or c == "." or c == "-"))
                            keep = val > threshold
                        break
            elif "<" in condition:
                for col in columns:
                    if col in condition and col in row_dict:
                        val = row_dict[col]
                        if isinstance(val, (int, float)):
                            rest = condition.split("<", 1)[1]
                            threshold = float("".join(c for c in rest if c.isdigit() or c == "." or c == "-"))
                            keep = val < threshold
                        break
            elif "contains" in cond_lower or "like" in cond_lower:
                for col in columns:
                    if col in row_dict:
                        val = str(row_dict[col]).lower()
                        if val and any(part in val for part in cond_lower.split() if len(part) > 2):
                            keep = True
                        break
            if keep:
                filtered.append(row)
        except Exception:
            filtered.append(row)
    return filtered[:5] if filtered else rows[:2]


def _apply_map_select(columns: list[str], rows: list[list[Any]], config: dict) -> tuple[list[str], list[list[Any]]]:
    """Keep only specified columns or add new ones with placeholders."""
    select_cols = config.get("selectColumns", config.get("columns", []))
    if isinstance(select_cols, str):
        select_cols = [c.strip() for c in select_cols.split(",") if c.strip()]
    if not select_cols:
        return columns, rows[:5]
    out_cols = [c for c in select_cols if c in columns]
    new_cols = [c for c in select_cols if c not in columns]
    out_cols = out_cols + new_cols if new_cols else out_cols
    if not out_cols:
        return columns, rows[:5]
    col_indices = [columns.index(c) for c in out_cols if c in columns]
    out_rows = []
    for row in rows[:5]:
        out_row = [row[i] for i in col_indices]
        for _ in new_cols:
            out_row.append("<placeholder>")
        out_rows.append(out_row)
    return out_cols, out_rows


def _apply_flatten_explode(columns: list[str], rows: list[list[Any]], config: dict) -> tuple[list[str], list[list[Any]]]:
    """Duplicate rows for array columns (simplified: expand each row 2x for demo)."""
    array_col = config.get("arrayColumn", config.get("column", ""))
    if array_col and array_col in columns:
        out_rows = []
        for row in rows[:3]:
            row_dict = dict(zip(columns, row))
            val = row_dict.get(array_col)
            if isinstance(val, str) and val.startswith("["):
                try:
                    arr = json.loads(val)
                    for item in (arr[:2] if isinstance(arr, list) else [val]):
                        new_row = list(row)
                        idx = columns.index(array_col)
                        new_row[idx] = item
                        out_rows.append(new_row)
                except json.JSONDecodeError:
                    out_rows.append(row)
                    out_rows.append(row)
            else:
                out_rows.append(row)
                out_rows.append(row)
        return columns, out_rows[:5] if out_rows else rows[:5]
    return columns, [r for r in rows[:5] for _ in (0, 1)][:5]


def _apply_window_aggregate(
    columns: list[str], rows: list[list[Any]], config: dict
) -> tuple[list[str], list[list[Any]]]:
    """Return aggregated summary row(s)."""
    group_keys = config.get("groupByKeys", [])
    if isinstance(group_keys, str):
        group_keys = [group_keys] if group_keys else []
    agg_config = config.get("aggregations", [])
    if isinstance(agg_config, str):
        try:
            agg_config = json.loads(agg_config) if agg_config else []
        except json.JSONDecodeError:
            agg_config = []

    group_cols = [c for c in (group_keys if isinstance(group_keys, list) else []) if c in columns]
    agg_cols = []
    for a in agg_config:
        if isinstance(a, dict) and "column" in a and "function" in a:
            agg_cols.append(f"{a['function']}({a['column']})")

    out_cols = group_cols + (agg_cols if agg_cols else ["count", "sum_amount"])
    out_rows = []
    seen = set()
    for row in rows[:5]:
        key = tuple(row[columns.index(c)] for c in group_cols) if group_cols else (0,)
        if key not in seen:
            seen.add(key)
            agg_vals = [random.randint(1, 100), random.randint(100, 1000)]
            out_rows.append(list(key) + agg_vals[: len(out_cols) - len(group_cols)])
    if not out_rows:
        out_rows = [["group1", 5, 250], ["group2", 3, 180]]
    return out_cols, out_rows[:5]


def _apply_join(
    left_cols: list[str], left_rows: list[list[Any]],
    right_cols: list[str], right_rows: list[list[Any]],
) -> tuple[list[str], list[list[Any]]]:
    """Merge two input datasets side by side."""
    out_cols = left_cols + [f"r_{c}" for c in right_cols]
    out_rows = []
    for i, lr in enumerate(left_rows[:3]):
        rr = right_rows[i % len(right_rows)] if right_rows else []
        out_rows.append(list(lr) + list(rr))
    return out_cols, out_rows[:5]


def _apply_union(
    cols1: list[str], rows1: list[list[Any]],
    cols2: list[str], rows2: list[list[Any]],
) -> tuple[list[str], list[list[Any]]]:
    """Concatenate input datasets (align columns)."""
    all_cols = list(dict.fromkeys(cols1 + cols2))
    out_rows = []
    for row in rows1[:3]:
        out_row = []
        for c in all_cols:
            out_row.append(row[cols1.index(c)] if c in cols1 else None)
        out_rows.append(out_row)
    for row in rows2[:3]:
        out_row = []
        for c in all_cols:
            out_row.append(row[cols2.index(c)] if c in cols2 else None)
        out_rows.append(out_row)
    return all_cols, out_rows[:5]


def _apply_rename_cast(columns: list[str], rows: list[list[Any]], config: dict) -> tuple[list[str], list[list[Any]]]:
    """Rename column headers."""
    mappings = config.get("columnMappings", config.get("mappings", []))
    if isinstance(mappings, str):
        try:
            mappings = json.loads(mappings) if mappings else []
        except json.JSONDecodeError:
            mappings = []
    if not mappings:
        return columns, rows[:5]
    rename = {}
    for m in mappings:
        if isinstance(m, dict) and "from" in m and "to" in m:
            rename[m["from"]] = m["to"]
        elif isinstance(m, dict) and "source" in m and "target" in m:
            rename[m["source"]] = m["target"]
    out_cols = [rename.get(c, c) for c in columns]
    return out_cols, rows[:5]


def _apply_cep_pattern(columns: list[str], rows: list[list[Any]]) -> tuple[list[str], list[list[Any]]]:
    """Pass through with added pattern columns."""
    out_cols = columns + ["pattern_matched", "match_id"]
    out_rows = []
    for i, row in enumerate(rows[:5]):
        out_rows.append(list(row) + [True, f"match-{i + 1}"])
    return out_cols, out_rows


def _apply_lookup_enrichment(columns: list[str], rows: list[list[Any]], config: dict) -> tuple[list[str], list[list[Any]]]:
    """Add lookup columns with placeholder values."""
    lookup_cols = config.get("lookupColumns", config.get("columns", ["lookup_val"]))
    if isinstance(lookup_cols, str):
        lookup_cols = [lookup_cols]
    out_cols = columns + lookup_cols
    out_rows = []
    for row in rows[:5]:
        out_rows.append(list(row) + ["<lookup>" for _ in lookup_cols])
    return out_cols, out_rows


def _apply_sink(columns: list[str], rows: list[list[Any]]) -> tuple[list[str], list[list[Any]]]:
    """Pass through (no transformation)."""
    return columns, rows[:5]


def _transform_node(
    node_type: str,
    config: dict,
    category: str,
    upstream_data: dict[str, tuple[list[str], list[list[Any]]]],
) -> tuple[list[str], list[list[Any]]]:
    """Apply node transformation to upstream data."""
    upstream_list = list(upstream_data.values())
    if not upstream_list:
        return ["id", "value"], [["no_input", 0]]

    cols, rows = upstream_list[0]
    if len(upstream_list) > 1:
        cols2, rows2 = upstream_list[1]

    if category == "source":
        return _generate_source_sample(node_type, config)

    if category == "transform":
        if node_type == "filter":
            return cols, _apply_filter(cols, rows, config.get("condition", ""))
        if node_type == "map-select":
            return _apply_map_select(cols, rows, config)
        if node_type == "flatten-explode":
            return _apply_flatten_explode(cols, rows, config)
        if node_type == "window-aggregate":
            return _apply_window_aggregate(cols, rows, config)
        if node_type in ("stream-stream-join", "stream-static-join") and len(upstream_list) >= 2:
            return _apply_join(cols, rows, cols2, rows2)
        if node_type == "union-merge" and len(upstream_list) >= 2:
            return _apply_union(cols, rows, cols2, rows2)
        if node_type == "rename-cast":
            return _apply_rename_cast(cols, rows, config)
        if node_type == "lookup-enrichment":
            return _apply_lookup_enrichment(cols, rows, config)
        if node_type == "custom-python-udf":
            return cols, rows[:5]
        return cols, rows[:5]

    if category == "cep-pattern":
        return _apply_cep_pattern(cols, rows)

    if category == "sink":
        return _apply_sink(cols, rows)

    return cols, rows[:5]


@router.post("/flow", response_model=FlowPreviewResponse)
async def flow_preview(request: FlowPreviewRequest) -> FlowPreviewResponse:
    """
    Compute flow-through preview: data flows from sources through each node
    in topological order, with each node transforming its upstream output.
    """
    pipeline = request.pipeline
    nodes_raw = pipeline.get("nodes", [])
    edges_raw = pipeline.get("edges", [])

    if not nodes_raw:
        return FlowPreviewResponse(node_previews={})

    # Convert to PipelineNode/PipelineEdge for graph_utils (exclude group nodes)
    nodes = [
        PipelineNode(
            id=n.get("id", ""),
            type=n.get("type", "map-select"),
            position=n.get("position", {"x": 0, "y": 0}),
            config=n.get("config", {}),
            label=n.get("label"),
        )
        for n in nodes_raw
        if n.get("id") and n.get("type") != "group"
    ]
    edges = [
        PipelineEdge(
            id=e.get("id", f"{e.get('source')}-{e.get('target')}"),
            source=e["source"],
            target=e["target"],
            sourceHandle=e.get("sourceHandle"),
            targetHandle=e.get("targetHandle"),
        )
        for e in edges_raw
        if e.get("source") and e.get("target")
    ]

    try:
        order = topological_sort(nodes, edges)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    node_previews: dict[str, dict[str, Any]] = {}
    data_cache: dict[str, tuple[list[str], list[list[Any]]]] = {}

    for node_id in order:
        node = _get_node_by_id(pipeline, node_id)
        if not node:
            continue
        node_type = node.get("type", "map-select")
        config = node.get("config", {})
        category = _get_node_category(node_type)

        upstream_ids = get_upstream_nodes(node_id, edges)
        upstream_data = {uid: data_cache[uid] for uid in upstream_ids if uid in data_cache}

        columns, rows = _transform_node(node_type, config, category, upstream_data)
        data_cache[node_id] = (columns, rows)
        node_previews[node_id] = {"columns": columns, "rows": rows}

    return FlowPreviewResponse(node_previews=node_previews)
