"""
Data preview API router.

Returns live data from connected sources (e.g. Kafka) when connection
parameters are provided, falling back to synthetic sample data otherwise.
"""

import json
import logging
import random
import re
import string
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

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
    source: str = Field(default="synthetic", description="'live' or 'synthetic'")


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


def _decode_message_value(raw: bytes) -> str:
    """Best-effort decode of a Kafka message value.

    Handles plain JSON/text, and Confluent Schema Registry wire format
    (magic byte 0x00 + 4-byte schema ID + Avro payload) by stripping the
    5-byte header and returning the printable portion.
    """
    if not raw:
        return ""
    # Try plain JSON / UTF-8 first
    try:
        text = raw.decode("utf-8")
        json.loads(text)
        return text
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass

    # Confluent Schema Registry wire format: strip 5-byte header
    if len(raw) > 5 and raw[0] == 0:
        payload = raw[5:]
        # Filter to printable ASCII + common whitespace
        chars = []
        for b in payload:
            if 32 <= b < 127 or b in (9, 10, 13):
                chars.append(chr(b))
            elif chars and chars[-1] != " ":
                chars.append(" ")
        cleaned = " ".join("".join(chars).split())
        if cleaned:
            return cleaned

    return raw.decode("utf-8", errors="replace")


def _extract_human_readable_logistics_event(text: str, ts_ms: int | None = None) -> str | None:
    """Best-effort parser for logistics-style Kafka payload text.

    Example input:
      "g TRAMS346376Your order is being picked. DHL BRed Belt ( XL ) AMS Received"
    """
    cleaned = " ".join(text.split())
    if not cleaned:
        return None

    tracking_match = re.search(r"(TR[A-Z]{3}\d+)", cleaned)
    if not tracking_match:
        return None

    carriers = ("DHL", "USPS", "CDM", "COR", "UPS", "FEDEX", "AMZL")
    carrier_match = re.search(r"\b(" + "|".join(carriers) + r")\b", cleaned)
    state_match = re.search(r"\b(Received|Processing|Shipped|Delivered|InTransit|Cancelled)\s*$", cleaned)
    next_hop_match = re.search(r"\b([A-Z]{3})\s+(Received|Processing|Shipped|Delivered|InTransit|Cancelled)\s*$", cleaned)

    tracking_id = tracking_match.group(1)
    event: dict[str, Any] = {"tracking_id": tracking_id}

    if carrier_match:
        event["carrier"] = carrier_match.group(1)
    if next_hop_match:
        event["next_hop_location"] = next_hop_match.group(1)
    if state_match:
        event["state"] = state_match.group(1)
    if ts_ms and ts_ms > 0:
        event["time_utc"] = int(ts_ms / 1000)

    msg_start = tracking_match.end()
    msg_end = carrier_match.start() if carrier_match else len(cleaned)
    message = cleaned[msg_start:msg_end].strip(" -:")
    if message:
        event["message"] = message

    if carrier_match:
        manifest_start = carrier_match.end()
        manifest_end = next_hop_match.start() if next_hop_match else len(cleaned)
        manifest = cleaned[manifest_start:manifest_end].strip(" -:")
        if manifest:
            event["manifest"] = manifest

    # Require at least tracking_id + one useful attribute
    if len(event) < 2:
        return None
    return json.dumps(event, ensure_ascii=False)


def _build_kafka_connection_info(config: dict) -> tuple[str, str]:
    """Extract bootstrap and topic from config with tolerant key variants."""
    bootstrap = (
        config.get("bootstrapServers")
        or config.get("bootstrap_servers")
        or config.get("serviceUri")
        or config.get("service_uri")
        or config.get("kafkaBootstrapServers")
        or ""
    )
    topic = (
        config.get("topics")
        or config.get("topic")
        or config.get("topicName")
        or config.get("topic_name")
        or ""
    )

    host = config.get("host") or config.get("hostname")
    port = config.get("port")
    if (not bootstrap) and host and port:
        bootstrap = f"{host}:{port}"

    if isinstance(topic, str) and "," in topic:
        topic = topic.split(",")[0].strip()

    return str(bootstrap).strip(), str(topic).strip()


def _try_live_kafka(config: dict) -> tuple[list[str], list[list[Any]]] | None:
    """Attempt to read live messages from Kafka. Returns None on failure."""
    bootstrap, topic = _build_kafka_connection_info(config)
    if not bootstrap or not topic:
        return None

    try:
        from confluent_kafka import Consumer, KafkaError
    except ImportError:
        logger.debug("confluent-kafka not installed, skipping live preview")
        return None

    consumer_conf: dict[str, Any] = {
        "bootstrap.servers": bootstrap,
        "group.id": f"lakestream-preview-{random.randint(1000, 9999)}",
        "auto.offset.reset": "earliest",
        "session.timeout.ms": 10000,
        "socket.timeout.ms": 5000,
    }

    security_protocol = config.get("securityProtocol", config.get("security_protocol", "PLAINTEXT"))
    if security_protocol and security_protocol != "PLAINTEXT":
        consumer_conf["security.protocol"] = security_protocol

    sasl_mechanism = config.get("saslMechanism", config.get("sasl_mechanism", ""))
    sasl_username = config.get("saslUsername", config.get("sasl_username", ""))
    sasl_password = config.get("saslPassword", config.get("sasl_password", ""))

    if security_protocol in ("SASL_SSL", "SASL_PLAINTEXT") and sasl_username:
        consumer_conf["sasl.mechanism"] = sasl_mechanism or "PLAIN"
        consumer_conf["sasl.username"] = sasl_username
        consumer_conf["sasl.password"] = sasl_password

    ssl_truststore_location = config.get("sslTruststoreLocation", config.get("ssl_truststore_location", ""))
    if "SSL" in security_protocol:
        if ssl_truststore_location:
            consumer_conf["ssl.ca.location"] = ssl_truststore_location
        else:
            # Managed services (Aiven, Confluent Cloud) use public CAs or
            # need verification disabled when no CA cert is provided.
            consumer_conf["enable.ssl.certificate.verification"] = False

    consumer = None
    try:
        from confluent_kafka import OFFSET_BEGINNING, TopicPartition
        from confluent_kafka.admin import AdminClient, NewTopic

        admin_conf = {k: v for k, v in consumer_conf.items() if not k.startswith("group.id")}
        admin = AdminClient(admin_conf)

        # Create topic when missing (best effort)
        md = admin.list_topics(timeout=5)
        topic_md = md.topics.get(topic)
        topic_missing = topic_md is None or topic_md.error is not None
        if topic_missing:
            logger.info("Live Kafka preview: topic '%s' not found, creating it", topic)
            partitions = int(config.get("numPartitions", config.get("num_partitions", 1)) or 1)
            replication = int(config.get("replicationFactor", config.get("replication_factor", 1)) or 1)
            futures = admin.create_topics([NewTopic(topic, num_partitions=partitions, replication_factor=replication)])
            try:
                futures[topic].result(timeout=10)
                logger.info("Live Kafka preview: created topic '%s'", topic)
            except Exception as exc:
                # If another actor created it concurrently, proceed anyway.
                logger.warning("Live Kafka preview: topic create attempt for '%s' returned: %s", topic, exc)

        consumer = Consumer(consumer_conf)

        # Fetch topic metadata through the same consumer connection and assign
        # all partitions directly (no consumer-group subscribe/rebalance).
        md = consumer.list_topics(topic=topic, timeout=5.0)
        topic_md = md.topics.get(topic)
        if topic_md is None or topic_md.error is not None:
            logger.warning("Live Kafka preview failed: topic metadata unavailable for '%s'", topic)
            return None
        partition_ids = sorted(topic_md.partitions.keys())
        if not partition_ids:
            logger.info("Live Kafka preview: topic '%s' has no partitions", topic)
            return None

        assignments = [TopicPartition(topic, pid, OFFSET_BEGINNING) for pid in partition_ids]
        consumer.assign(assignments)

        columns = ["key", "value", "topic", "partition", "offset", "timestamp"]
        rows: list[list[Any]] = []
        empty_polls = 0
        max_empty = 3

        while len(rows) < 10 and empty_polls < max_empty:
            msg = consumer.poll(timeout=2.0)
            if msg is None:
                empty_polls += 1
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    empty_polls += 1
                    continue
                logger.warning("Kafka poll error: %s", msg.error())
                break
            empty_polls = 0
            key_str = msg.key().decode("utf-8", errors="replace") if msg.key() else ""
            ts_type, ts_val = msg.timestamp()
            raw_val = _decode_message_value(msg.value()) if msg.value() else ""
            val_str = _extract_human_readable_logistics_event(raw_val, ts_val) or raw_val
            ts_type, ts_val = msg.timestamp()
            ts_str = datetime.utcfromtimestamp(ts_val / 1000).isoformat() + "Z" if ts_val > 0 else ""
            rows.append([key_str, val_str, msg.topic(), msg.partition(), msg.offset(), ts_str])

        if rows:
            logger.info("Live Kafka preview: got %d messages from topic '%s'", len(rows), topic)
            return columns, rows
        logger.info("Live Kafka preview: no messages in topic '%s'", topic)
        return columns, []

    except Exception as exc:
        logger.warning("Live Kafka preview failed: %s", exc)
        return None
    finally:
        if consumer:
            try:
                consumer.close()
            except Exception:
                pass


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


def _get_upstream_sample(
    pipeline: dict, node_id: str, visited: set[str], seed: int | None = None,
) -> tuple[list[str], list[list[Any]], str]:
    """Recursively get sample from upstream nodes.

    Returns (columns, rows, source) where source is 'live' or 'synthetic'.
    """
    if node_id in visited:
        return ["id", "value"], [["circular", 0]], "synthetic"
    visited.add(node_id)
    node = _get_node_by_id(pipeline, node_id)
    if not node:
        return ["id", "value"], [["unknown", 0]], "synthetic"

    node_type = node.get("type", "map-select")
    config = node.get("config", {})

    upstream_ids = _get_upstream_node_ids(pipeline, node_id)
    if upstream_ids:
        category = _get_node_category(node_type)

        if node_type == "union-merge" and len(upstream_ids) >= 2:
            all_cols: list[str] = []
            all_rows: list[list[Any]] = []
            src = "synthetic"
            for uid in upstream_ids:
                ucols, urows, usrc = _get_upstream_sample(pipeline, uid, set(visited), seed=seed)
                if usrc == "live":
                    src = "live"
                if not all_cols:
                    all_cols = ucols
                    all_rows = urows
                else:
                    merged_cols = list(all_cols)
                    for c in ucols:
                        if c not in merged_cols:
                            merged_cols.append(c)
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
            return all_cols, all_rows[:5], src

        cols, rows, src = _get_upstream_sample(pipeline, upstream_ids[0], visited, seed=seed)

        if category == "transform" and node_type == "filter":
            cond = config.get("condition", "")
            if src != "live":
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
            return cols, rows, src

        if category == "transform" and node_type == "window-aggregate":
            c, r = _generate_aggregate_sample(cols, rows, config)
            return c, r, src

        if category in ("cep-pattern", "pattern"):
            c, r = _generate_cep_pattern_sample(cols, rows, node_type)
            return c, r, src

        if category == "sink" and node_type == "kafka-topic-sink":
            live_result = _try_live_kafka(config)
            if live_result is not None:
                return live_result[0], live_result[1], "live"
            c, r = _generate_delta_sink_schema_sample(cols, rows)
            return c, r, src

        if category == "sink":
            c, r = _generate_delta_sink_schema_sample(cols, rows)
            return c, r, src

        return cols, rows[:5], src

    # Source node — try live connection first for Kafka-like types
    if node_type in ("kafka-topic", "kafka-topic-sink", "cdc-stream", "event-hub-kinesis"):
        live_result = _try_live_kafka(config)
        if live_result is not None:
            return live_result[0], live_result[1], "live"

    cols, rows = _generate_source_sample(node_type, config)
    return cols, rows, "synthetic"


@router.post("/sample", response_model=PreviewResponse)
async def preview_sample(request: PreviewRequest) -> PreviewResponse:
    """Return sample data for the given node.

    Attempts a live connection for source nodes that have connection
    parameters configured (e.g. Kafka bootstrapServers). Falls back to
    synthetic data when live access is unavailable or not configured.
    """
    pipeline = request.pipeline
    node_id = request.node_id

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
        columns, rows, source = _get_upstream_sample(pipeline, node_id, set(), seed=request.seed)
        rows = rows[:10]
        return PreviewResponse(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            source=source,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}") from e
