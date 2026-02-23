"""
SSS (Spark Structured Streaming) code generator.

Generates PySpark code with TransformWithState for CEP pattern nodes.
"""

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.codegen.graph_utils import get_upstream_nodes, topological_sort
from app.models.nodes import NodeCategory, NODE_REGISTRY
from app.models.pipeline import PipelineDefinition, PipelineNode

# Template directory relative to this file
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "sss"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
)
_env.filters["pyvar"] = lambda s: str(s).replace("-", "_")


def _node_label(node: PipelineNode) -> str:
    """Get display label for a node (label or type-based fallback)."""
    if node.label and node.label.strip():
        return node.label.strip()
    return node.type.replace("-", " ").title()


def _parse_duration_to_ms(duration: str) -> int:
    """Parse duration string like '10 minutes', '1 hour' to milliseconds."""
    if isinstance(duration, (int, float)):
        return int(duration)
    s = str(duration).strip().lower()
    m = re.match(r"(\d+(?:\.\d+)?)\s*(second|minute|hour)s?", s)
    if not m:
        return 60000  # default 1 minute
    val, unit = float(m.group(1)), m.group(2)
    if "second" in unit:
        return int(val * 1000)
    if "minute" in unit:
        return int(val * 60 * 1000)
    if "hour" in unit:
        return int(val * 3600 * 1000)
    return int(val * 60000)


def _get_upstream_var(node: PipelineNode, pipeline: PipelineDefinition) -> str:
    """Get the variable name of the upstream node (for chaining)."""
    upstream_ids = get_upstream_nodes(node.id, pipeline.edges)
    if upstream_ids:
        safe_id = upstream_ids[0].replace("-", "_")
        return f"df_{safe_id}"
    return "source"


def _get_upstream_vars(node: PipelineNode, pipeline: PipelineDefinition) -> list[str]:
    """Get variable names of all upstream nodes (for multi-input nodes)."""
    upstream_ids = get_upstream_nodes(node.id, pipeline.edges)
    return [f"df_{uid.replace('-', '_')}" for uid in upstream_ids]


def _render_node_snippet(node: PipelineNode, pipeline: PipelineDefinition) -> str:
    """Render the SSS snippet for a single node based on its type."""
    config = node.config or {}

    # MVP: Implement sequence-detector, absence-detector
    if node.type == "sequence-detector":
        template = _env.get_template("sequence_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            pattern=config.get("pattern", "A -> B -> C"),
            timeout_seconds=config.get("timeout_seconds", 60),
            key_column=config.get("key_column", "key"),
            event_time_column=config.get("event_time_column", "event_time"),
        )

    if node.type == "absence-detector":
        template = _env.get_template("absence_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            expected_event=config.get("expected_event", "heartbeat"),
            absence_timeout_seconds=config.get("absence_timeout_seconds", 300),
            key_column=config.get("key_column", "key"),
            event_time_column=config.get("event_time_column", "event_time"),
        )

    # CEP pattern nodes: count-threshold, velocity-detector, geofence-location, etc.
    key_col = config.get("key_column", "key")
    event_time_col = config.get("event_time_column", "event_time")
    watermark_delay = config.get("watermark_delay", "10 minutes")

    if node.type == "count-threshold":
        template = _env.get_template("count_threshold.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        window_dur = config.get("window_duration", "5 minutes")
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            threshold=config.get("threshold", 10),
            window_duration=window_dur,
            window_ms=_parse_duration_to_ms(window_dur),
            key_column=key_col,
            event_time_column=event_time_col,
            watermark_delay=watermark_delay,
        )

    if node.type == "velocity-detector":
        template = _env.get_template("velocity_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        window_dur = config.get("window_duration", "1 minute")
        rate_unit = config.get("rate_unit", "second")
        rate_threshold = config.get("rate_threshold", 10.0)
        window_ms = _parse_duration_to_ms(window_dur)
        if "minute" in rate_unit.lower():
            rate_threshold = rate_threshold / 60
        elif "hour" in rate_unit.lower():
            rate_threshold = rate_threshold / 3600
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            rate_threshold=rate_threshold,
            rate_unit=rate_unit,
            window_duration=window_dur,
            window_ms=window_ms,
            key_column=key_col,
            event_time_column=event_time_col,
            watermark_delay=watermark_delay,
        )

    if node.type == "geofence-location":
        template = _env.get_template("geofence_location.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            key_column=key_col,
            lat_column=config.get("lat_column", "lat"),
            lon_column=config.get("lon_column", "lon"),
            center_lat=config.get("center_lat", 0.0),
            center_lon=config.get("center_lon", 0.0),
            radius_meters=config.get("radius_meters", 100),
            mode=config.get("mode", "enter_or_exit"),
        )

    if node.type == "temporal-correlation":
        template = _env.get_template("temporal_correlation.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        window_dur = config.get("window_duration", "5 minutes")
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            window_duration=window_dur,
            window_ms=_parse_duration_to_ms(window_dur),
            key_column=key_col,
            event_time_column=event_time_col,
            watermark_delay=watermark_delay,
            stream_a_column=config.get("stream_a_column", "stream_id"),
            stream_b_column=config.get("stream_b_column", ""),
        )

    if node.type == "trend-detector":
        template = _env.get_template("trend_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            key_column=key_col,
            value_column=config.get("value_column", "value"),
            num_consecutive=config.get("num_consecutive", 5),
            direction=config.get("direction", "increase"),
            tolerance=config.get("tolerance", 0.0),
        )

    if node.type == "outlier-anomaly":
        template = _env.get_template("outlier_anomaly.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            key_column=key_col,
            value_column=config.get("value_column", "value"),
            threshold=config.get("threshold", 3.0),
            min_samples=config.get("min_samples", 10),
        )

    if node.type == "session-detector":
        template = _env.get_template("session_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            key_column=key_col,
            event_time_column=event_time_col,
            gap_duration=config.get("gap_duration", "5 minutes"),
            watermark_delay=watermark_delay,
        )

    if node.type == "deduplication":
        template = _env.get_template("deduplication.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        key_cols = config.get("key_columns", ["key"])
        if isinstance(key_cols, str):
            key_cols = [key_cols]
        key_cols_py = "[" + ", ".join(f'"{c}"' for c in key_cols) + "]"
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            event_time_column=event_time_col,
            watermark_delay=watermark_delay,
            key_columns=key_cols_py,
        )

    if node.type == "match-recognize-sql":
        template = _env.get_template("match_recognize_sql.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        raw_sql = config.get("raw_sql")
        if raw_sql:
            return f"""# Match Recognize SQL: {node.id}
{upstream}.createOrReplaceTempView("{config.get('input_view', 'stream_input')}")

df_{node.id.replace("-", "_")} = spark.sql('''
{raw_sql}
''')
"""
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            input_view=config.get("input_view", "stream_input"),
            partition_by=config.get("partition_by", "PARTITION BY key"),
            order_by=config.get("order_by", "ORDER BY event_time"),
            measures=config.get("measures", "MEASURES A.key AS key"),
            pattern=config.get("pattern", "PATTERN (A B)"),
            define=config.get("define", "DEFINE A AS A.value > 0, B AS B.value > 0"),
            within=config.get("within", "WITHIN 10 MINUTES"),
        )

    if node.type == "custom-stateful-processor":
        template = _env.get_template("custom_stateful_processor.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            key_column=key_col,
            user_code=config.get("user_code", "# User StatefulProcessor class here"),
            output_schema=config.get("output_schema", "StructType()"),
            processor_class_name=config.get("processor_class_name", "CustomProcessor"),
        )

    # Non-CEP nodes: sources, transforms, sinks
    if node.type == "kafka-topic":
        return f"""# Kafka source for {node.id}
df_{node.id.replace("-", "_")} = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", "{config.get('bootstrap_servers', 'localhost:9092')}")
    .option("subscribe", "{config.get('topic', 'events')}")
    .load()
)
"""

    if node.type == "filter":
        upstream = _get_upstream_var(node, pipeline)
        return f"""# Filter for {node.id}
df_{node.id.replace("-", "_")} = {upstream}.filter("{config.get('condition', '1=1')}")
"""

    if node.type == "delta-table-sink":
        upstream = _get_upstream_var(node, pipeline)
        return f"""# Delta sink for {node.id}
{upstream}.writeStream
    .format("delta")
    .option("checkpointLocation", "{config.get('checkpoint_location', f'/tmp/checkpoints/{node.id}')}")
    .table("{config.get('catalog', 'main')}.{config.get('schema', 'default')}.{config.get('table_name', 'output_table')}")
"""

    # Sources
    if node.type == "delta-table-source":
        template = _env.get_template("delta_table_source.py.j2")
        return template.render(
            node_id=node.id,
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "source_table"),
        )

    if node.type == "auto-loader":
        template = _env.get_template("auto_loader.py.j2")
        return template.render(
            node_id=node.id,
            path=config.get("path", "/path/to/data"),
            format=config.get("format", "json"),
        )

    # Transforms
    if node.type == "map-select":
        template = _env.get_template("map_select.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        exprs = config.get("select_exprs", "F.col('*')")
        if isinstance(exprs, list):
            exprs = ", ".join(exprs)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            select_exprs=exprs,
        )

    if node.type == "flatten-explode":
        template = _env.get_template("flatten_explode.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            array_column=config.get("array_column", "items"),
            alias=config.get("alias", "item"),
        )

    if node.type == "lookup-enrichment":
        template = _env.get_template("lookup_enrichment.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            lookup_table=config.get("lookup_table", "main.default.lookup"),
            join_key=config.get("join_key", "key"),
        )

    if node.type == "stream-stream-join":
        template = _env.get_template("stream_stream_join.py.j2")
        upstreams = _get_upstream_vars(node, pipeline)
        left_var = upstreams[0] if len(upstreams) > 0 else "df_left"
        right_var = upstreams[1] if len(upstreams) > 1 else "df_right"
        return template.render(
            node_id=node.id,
            left_var=left_var,
            right_var=right_var,
            left_time_col=config.get("left_time_column", "event_time"),
            right_time_col=config.get("right_time_column", "event_time"),
            left_watermark=config.get("left_watermark", "10 minutes"),
            right_watermark=config.get("right_watermark", "10 minutes"),
            join_condition=config.get("join_condition", "left.key = right.key"),
            join_type=config.get("join_type", "inner"),
        )

    if node.type == "stream-static-join":
        template = _env.get_template("stream_static_join.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            static_table=config.get("static_table", "main.default.lookup"),
            join_condition=config.get("join_condition", "stream.key = lookup.key"),
            join_type=config.get("join_type", "left"),
        )

    if node.type == "union-merge":
        template = _env.get_template("union_merge.py.j2")
        upstreams = _get_upstream_vars(node, pipeline)
        left_var = upstreams[0] if len(upstreams) > 0 else "df_left"
        right_var = upstreams[1] if len(upstreams) > 1 else "df_right"
        return template.render(
            node_id=node.id,
            left_var=left_var,
            right_var=right_var,
        )

    if node.type == "rename-cast":
        template = _env.get_template("rename_cast.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        renames = config.get("renames", [])
        casts = config.get("casts", [])
        if isinstance(renames, dict):
            renames = list(renames.items())
        if isinstance(casts, dict):
            casts = list(casts.items())
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            renames=renames,
            casts=casts,
        )

    if node.type == "custom-python-udf":
        template = _env.get_template("custom_python_udf.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            udf_code=config.get("udf_code", "my_udf = F.udf(lambda x: x, StringType())"),
            udf_name=config.get("udf_name", "my_udf"),
            udf_input_cols=config.get("udf_input_cols", "F.col('value')"),
            udf_return_type=config.get("udf_return_type", "StringType"),
            output_column=config.get("output_column", "result"),
        )

    # Sinks
    if node.type == "kafka-topic-sink":
        template = _env.get_template("kafka_topic_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "output"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "rest-webhook-sink":
        template = _env.get_template("rest_webhook_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            webhook_url=config.get("webhook_url", "https://example.com/webhook"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "slack-teams-pagerduty":
        template = _env.get_template("slack_teams_pagerduty_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            webhook_url=config.get("webhook_url", "https://hooks.slack.com/..."),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "email-sink":
        template = _env.get_template("email_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            subject=config.get("subject", "Streaming Alert"),
            from_email=config.get("from_email", "alerts@example.com"),
            to_email=config.get("to_email", "ops@example.com"),
            smtp_host=config.get("smtp_host", "smtp.example.com"),
            smtp_port=config.get("smtp_port", 587),
            smtp_user=config.get("smtp_user", ""),
            smtp_password=config.get("smtp_password", ""),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "sql-warehouse-sink":
        template = _env.get_template("sql_warehouse_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "unity-catalog-table-sink":
        template = _env.get_template("unity_catalog_table_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "dead-letter-queue":
        template = _env.get_template("dead_letter_queue.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            dlq_table=config.get("dlq_table", "main.default.dlq"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    # Generic placeholder for other node types
    metadata = NODE_REGISTRY.get(node.type)
    if metadata and metadata["category"] == NodeCategory.CEP_PATTERN:
        return f"# TODO: Implement SSS generation for CEP node type '{node.type}' (id={node.id})\n"
    return f"# TODO: Implement SSS generation for node type '{node.type}' (id={node.id})\n"


def generate_sss(pipeline: PipelineDefinition) -> str:
    """
    Generate complete SSS notebook code from pipeline definition.

    Topologically sorts nodes, generates TransformWithState for CEP patterns,
    and standard PySpark for other nodes.
    """
    sorted_ids = topological_sort(pipeline.nodes, pipeline.edges)
    node_map = {n.id: n for n in pipeline.nodes}

    snippets: list[str] = []
    for node_id in sorted_ids:
        node = node_map.get(node_id)
        if node:
            raw = _render_node_snippet(node, pipeline)
            label = _node_label(node)
            annotation = f"# [node: {node.id}] {label}\n"
            snippets.append(annotation + raw)

    template = _env.get_template("notebook.py.j2")
    return template.render(
        pipeline_name=pipeline.name,
        pipeline_description=pipeline.description or "",
        snippets=snippets,
    )
