"""
Data preview API router.

Returns synthetic sample data for a given node in a pipeline.
When connected to Databricks, could query actual data (future enhancement).
"""

import json
import random
import string
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


class PreviewRequest(BaseModel):
    """Request body for preview sample endpoint."""

    pipeline: dict[str, Any] = Field(
        ...,
        description="Pipeline definition with nodes and edges",
    )
    node_id: str = Field(..., description="Target node ID to preview")
    seed: int | None = Field(None, description="Random seed for consistent data across connected nodes")


class PreviewResponse(BaseModel):
    """Response with sample data in tabular format."""

    columns: list[str] = Field(..., description="Column names")
    rows: list[list[Any]] = Field(..., description="Row data as arrays")
    row_count: int = Field(..., description="Number of rows")


def _random_string(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def _random_timestamp() -> str:
    base = datetime.utcnow() - timedelta(days=1)
    delta = timedelta(seconds=random.randint(0, 86400))
    return (base + delta).isoformat() + "Z"


def _get_node_by_id(pipeline: dict, node_id: str) -> dict | None:
    nodes = pipeline.get("nodes", [])
    for n in nodes:
        if n.get("id") == node_id:
            return n
    return None


def _get_upstream_node_ids(pipeline: dict, node_id: str) -> list[str]:
    edges = pipeline.get("edges", [])
    return [e["source"] for e in edges if e.get("target") == node_id]


def _generate_source_sample(node_type: str, config: dict) -> tuple[list[str], list[list[Any]]]:
    """Generate synthetic sample for source nodes."""
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

    if node_type == "stream-simulator":
        profile = config.get("dataProfile", config.get("data_profile", "iot-sensors"))
        if profile == "iot-sensors":
            columns = ["sensor_id", "device_id", "temperature", "humidity", "event_time"]
            rows = []
            for i in range(5):
                sid = random.randint(1, 100)
                rows.append([sid, f"sensor-{sid}", round(-10 + random.random() * 60, 1), round(10 + random.random() * 90, 1), _random_timestamp()])
            return columns, rows
        if profile == "clickstream":
            columns = ["user_id", "session_id", "event_type", "page_url", "event_time"]
            rows = []
            for i in range(5):
                rows.append([f"user-{random.randint(1, 1000)}", f"session-{random.randint(1, 500)}", random.choice(["page_view", "click", "scroll", "add_to_cart", "purchase"]), f"/page/{random.randint(1, 50)}", _random_timestamp()])
            return columns, rows
        if profile == "financial-transactions":
            columns = ["transaction_id", "account_id", "amount", "currency", "txn_type", "event_time"]
            rows = []
            for i in range(5):
                rows.append([f"txn-{random.randint(10000, 99999)}", f"acct-{random.randint(1, 200)}", round(random.random() * 5000, 2), random.choice(["USD", "EUR", "GBP", "JPY"]), random.choice(["debit", "credit", "transfer"]), _random_timestamp()])
            return columns, rows
        if profile == "ecommerce-orders":
            columns = ["order_id", "customer_id", "product_id", "quantity", "unit_price", "status", "event_time"]
            rows = []
            for i in range(5):
                rows.append([f"order-{random.randint(10000, 99999)}", f"cust-{random.randint(1, 500)}", f"prod-{random.randint(1, 100)}", random.randint(1, 10), round(random.random() * 200, 2), random.choice(["pending", "shipped", "delivered"]), _random_timestamp()])
            return columns, rows

    if node_type == "google-pubsub":
        columns = ["message_id", "data", "publish_time", "subscription"]
        sub = config.get("subscriptionId", config.get("subscription_id", "my-subscription"))
        rows = []
        for i in range(5):
            rows.append([
                f"msg-{_random_string(10)}",
                json.dumps({"event": f"event_{i}", "value": random.randint(1, 500)}),
                _random_timestamp(),
                sub,
            ])
        return columns, rows

    # Default for other sources
    columns = ["id", "value", "timestamp"]
    rows = [[f"row-{i + 1}", random.randint(1, 100), _random_timestamp()] for i in range(5)]
    return columns, rows


def _apply_filter_best_effort(columns: list[str], rows: list[list[Any]], condition: str) -> list[list[Any]]:
    """Best-effort filter supporting compound AND/OR conditions with =, !=, >, <, >=, <=."""
    if not condition or not rows:
        return rows[:5]

    import re

    def _parse_atom(cond: str) -> tuple[str, str, str] | None:
        """Parse 'col OP value' into (column, operator, value)."""
        m = re.match(
            r"^\s*(\w+)\s*(>=|<=|!=|<>|>|<|=)\s*['\"]?([^'\"]+?)['\"]?\s*$",
            cond.strip(),
        )
        if not m:
            return None
        op = m.group(2)
        if op == "<>":
            op = "!="
        return (m.group(1), op, m.group(3))

    def _eval_atom(row_dict: dict, col: str, op: str, rhs: str) -> bool:
        if col not in row_dict:
            return True
        val = row_dict[col]
        try:
            rhs_num = float(rhs)
            val_num = float(val) if not isinstance(val, (int, float)) else val
            if op == "=":
                return val_num == rhs_num
            if op == "!=":
                return val_num != rhs_num
            if op == ">":
                return val_num > rhs_num
            if op == "<":
                return val_num < rhs_num
            if op == ">=":
                return val_num >= rhs_num
            if op == "<=":
                return val_num <= rhs_num
        except (ValueError, TypeError):
            s_val = str(val)
            if op == "=":
                return s_val == rhs
            if op == "!=":
                return s_val != rhs
        return True

    def _eval_row(row_dict: dict, condition_str: str) -> bool:
        """Evaluate a condition string (supports AND / OR) against a row."""
        # Split on OR first (lower precedence), then AND
        or_groups = re.split(r"\bOR\b", condition_str, flags=re.IGNORECASE)
        for or_group in or_groups:
            and_parts = re.split(r"\bAND\b", or_group, flags=re.IGNORECASE)
            all_true = True
            for part in and_parts:
                atom = _parse_atom(part)
                if atom is None:
                    continue
                col, op, rhs = atom
                if not _eval_atom(row_dict, col, op, rhs):
                    all_true = False
                    break
            if all_true:
                return True
        return False

    filtered = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        try:
            if _eval_row(row_dict, condition):
                filtered.append(row)
        except Exception:
            filtered.append(row)
    return filtered[:5] if filtered else rows[:2]


def _generate_aggregate_sample(upstream_columns: list[str], upstream_rows: list[list[Any]], config: dict) -> tuple[list[str], list[list[Any]]]:
    """Generate grouped/aggregated sample."""
    group_keys = config.get("groupByKeys", [])
    if isinstance(group_keys, str):
        group_keys = [group_keys] if group_keys else []
    agg_config = config.get("aggregations", [])
    if isinstance(agg_config, str):
        try:
            agg_config = json.loads(agg_config) if agg_config else []
        except json.JSONDecodeError:
            agg_config = []

    group_cols = [c for c in (group_keys if isinstance(group_keys, list) else []) if c in upstream_columns]
    agg_cols = []
    for a in agg_config:
        if isinstance(a, dict) and "column" in a and "function" in a:
            agg_cols.append(f"{a['function']}({a['column']})")

    columns = group_cols + agg_cols if agg_cols else group_cols + ["count", "sum_amount"]
    rows = []
    seen = set()
    for row in upstream_rows[:5]:
        key = tuple(row[upstream_columns.index(c)] for c in group_cols) if group_cols else (0,)
        if key not in seen:
            seen.add(key)
            agg_vals = [random.randint(1, 100), random.randint(100, 1000)]
            rows.append(list(key) + agg_vals[: len(columns) - len(group_cols)])
    if not rows:
        rows = [["group1", 5, 250], ["group2", 3, 180]]
    return columns, rows[:5]


def _generate_cep_pattern_sample(upstream_columns: list[str], upstream_rows: list[list[Any]], node_type: str) -> tuple[list[str], list[list[Any]]]:
    """Generate matched pattern events sample."""
    columns = upstream_columns + ["match_id", "pattern_name", "match_time"]
    rows = []
    for i, row in enumerate(upstream_rows[:3]):
        rows.append(list(row) + [f"match-{i + 1}", "pattern_matched", _random_timestamp()])
    if not rows:
        rows = [[f"val-{j}" for j in range(len(columns) - 3)] + ["m1", "pattern", _random_timestamp()]]
    return columns, rows


def _generate_delta_sink_schema_sample(upstream_columns: list[str], upstream_rows: list[list[Any]]) -> tuple[list[str], list[list[Any]]]:
    """Show final output schema for Delta sink."""
    if upstream_columns and upstream_rows:
        return upstream_columns, upstream_rows[:5]
    columns = ["id", "event_type", "amount", "timestamp"]
    rows = [[f"out-{i}", "sample", 100 + i, _random_timestamp()] for i in range(5)]
    return columns, rows


def _get_node_category(node_type: str) -> str:
    """Map node type to category."""
    source_types = {"kafka-topic", "delta-table-source", "auto-loader", "rest-webhook-source", "cdc-stream", "event-hub-kinesis", "mqtt", "custom-python-source", "stream-simulator", "google-pubsub"}
    sink_types = {"delta-table-sink", "kafka-topic-sink", "rest-webhook-sink", "slack-teams-pagerduty", "email-sink", "sql-warehouse-sink", "unity-catalog-table-sink", "dead-letter-queue", "feature-store-sink", "lakebase-sink"}
    pattern_types = {"sequence-detector", "absence-detector", "count-threshold", "velocity-detector", "geofence-location", "temporal-correlation", "trend-detector", "outlier-anomaly", "session-detector", "deduplication", "match-recognize-sql", "custom-stateful-processor", "state-machine", "heartbeat-liveness"}
    if node_type in source_types:
        return "source"
    if node_type in sink_types:
        return "sink"
    if node_type in pattern_types:
        return "cep-pattern"
    return "transform"


def _get_upstream_sample(pipeline: dict, node_id: str, visited: set[str], seed: int | None = None) -> tuple[list[str], list[list[Any]]]:
    """Recursively get sample from upstream nodes."""
    if node_id in visited:
        return ["id", "value"], [["circular", 0]]
    visited.add(node_id)
    node = _get_node_by_id(pipeline, node_id)
    if not node:
        return ["id", "value"], [["unknown", 0]]

    node_type = node.get("type", "map-select")
    config = node.get("config", {})

    upstream_ids = _get_upstream_node_ids(pipeline, node_id)
    if upstream_ids:
        category = _get_node_category(node_type)

        # Union / Merge: combine rows from all upstream sources
        if node_type == "union-merge" and len(upstream_ids) >= 2:
            all_cols: list[str] = []
            all_rows: list[list[Any]] = []
            for uid in upstream_ids:
                ucols, urows = _get_upstream_sample(pipeline, uid, set(visited), seed=seed)
                if not all_cols:
                    all_cols = ucols
                    all_rows = urows
                else:
                    # UNION ALL: pad columns to superset
                    merged_cols = list(all_cols)
                    for c in ucols:
                        if c not in merged_cols:
                            merged_cols.append(c)
                    # Re-index existing rows
                    col_idx_old = {c: i for i, c in enumerate(all_cols)}
                    col_idx_new = {c: i for i, c in enumerate(ucols)}
                    padded_existing = []
                    for r in all_rows:
                        new_row = [None] * len(merged_cols)
                        for ci, c in enumerate(merged_cols):
                            if c in col_idx_old:
                                new_row[ci] = r[col_idx_old[c]]
                        padded_existing.append(new_row)
                    padded_new = []
                    for r in urows:
                        new_row = [None] * len(merged_cols)
                        for ci, c in enumerate(merged_cols):
                            if c in col_idx_new:
                                new_row[ci] = r[col_idx_new[c]]
                        padded_new.append(new_row)
                    all_cols = merged_cols
                    all_rows = padded_existing + padded_new
            return all_cols, all_rows[:5]

        cols, rows = _get_upstream_sample(pipeline, upstream_ids[0], visited, seed=seed)

        if category == "transform" and node_type == "filter":
            cond = config.get("condition", "")
            # Re-seed so the upstream source produces the same base rows,
            # then generate extra rounds for better filter match rates
            upstream_node = _get_node_by_id(pipeline, upstream_ids[0])
            if upstream_node:
                up_type = upstream_node.get("type", "")
                up_config = upstream_node.get("config", {})
                if seed is not None:
                    random.seed(seed)
                extra_cols, extra_rows = _generate_source_sample(up_type, up_config)
                for _ in range(9):
                    _, more = _generate_source_sample(up_type, up_config)
                    extra_rows.extend(more)
                rows = extra_rows
            rows = _apply_filter_best_effort(cols, rows, cond)
            return cols, rows

        if category == "transform" and node_type == "window-aggregate":
            return _generate_aggregate_sample(cols, rows, config)

        if category in ("cep-pattern", "pattern"):
            return _generate_cep_pattern_sample(cols, rows, node_type)

        if category == "sink":
            return _generate_delta_sink_schema_sample(cols, rows)

        return cols, rows[:5]

    # Source node
    return _generate_source_sample(node_type, config)


@router.post("/sample", response_model=PreviewResponse)
async def preview_sample(request: PreviewRequest) -> PreviewResponse:
    """
    Return synthetic sample data for the given node in the pipeline.

    For now generates synthetic data based on node type.
    TODO: When connected to Databricks, query actual data from sources/tables.
    """
    pipeline = request.pipeline
    node_id = request.node_id

    # Seed random for deterministic data within a refresh cycle.
    # Connected nodes using the same seed will generate consistent upstream data.
    if request.seed is not None:
        random.seed(request.seed)

    node = _get_node_by_id(pipeline, node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    if "nodes" not in pipeline:
        pipeline = {"nodes": [], "edges": []}
    if "edges" not in pipeline:
        pipeline["edges"] = pipeline.get("edges", [])

    try:
        columns, rows = _get_upstream_sample(pipeline, node_id, set(), seed=request.seed)
        rows = rows[:10]
        return PreviewResponse(
            columns=columns,
            rows=rows,
            row_count=len(rows),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}") from e
