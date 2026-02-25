"""
SSS (Spark Structured Streaming) code generator.

Generates PySpark code with TransformWithState for CEP pattern nodes.
"""

import json
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
_env.filters["tojson"] = lambda x: json.dumps(x)


def _camel_to_snake(name: str) -> str:
    s1 = re.sub(r'([A-Z])', r'_\1', name)
    return s1.lower().lstrip('_')


def _normalize_config(config: dict) -> dict:
    if not config:
        return {}
    result = {}
    ALIASES = {
        'topics': 'topic', 'bootstrapservers': 'bootstrap_servers',
        'tablename': 'table_name', 'keycolumn': 'key_column',
        'valuecolumn': 'value_column', 'eventtimecolumn': 'event_time_column',
        'windowduration': 'window_duration', 'slideduration': 'slide_duration',
        'watermarkcolumn': 'watermark_column', 'watermarkdelay': 'watermark_delay',
        'checkpointlocation': 'checkpoint_location', 'outputmode': 'output_mode',
        'deserializationformat': 'deserialization_format',
        'consumergroup': 'consumer_group', 'startingoffset': 'starting_offset',
        'contiguitymode': 'contiguity_mode', 'withinduration': 'within_duration',
        'ratethreshold': 'rate_threshold', 'rateunit': 'rate_unit',
        'gapduration': 'gap_duration', 'numconsecutive': 'num_consecutive',
        'minsamples': 'min_samples', 'joinkey': 'join_key',
        'lookuptable': 'lookup_table', 'arraycolumn': 'array_column',
        'webhookurl': 'webhook_url', 'smtphost': 'smtp_host',
        'smtpport': 'smtp_port', 'smtpuser': 'smtp_user',
        'smtppassword': 'smtp_password', 'fromemail': 'from_email',
        'toemail': 'to_email', 'dlqtable': 'dlq_table',
        'warehouseid': 'warehouse_id', 'selectexprs': 'select_exprs',
        'joincondition': 'join_condition', 'jointype': 'join_type',
        'statictable': 'static_table', 'lefttimecolumn': 'left_time_column',
        'righttimecolumn': 'right_time_column', 'leftwatermark': 'left_watermark',
        'rightwatermark': 'right_watermark', 'udfcode': 'udf_code',
        'udfname': 'udf_name', 'udfreturntype': 'udf_return_type',
        'outputcolumn': 'output_column', 'processorclassname': 'processor_class_name',
        'usercode': 'user_code', 'outputschema': 'output_schema',
        'inputview': 'input_view', 'partitionby': 'partition_by',
        'orderby': 'order_by', 'rawsql': 'raw_sql',
        'latcolumn': 'lat_column', 'loncolumn': 'lon_column',
        'centerlat': 'center_lat', 'centerlon': 'center_lon',
        'radiusmeters': 'radius_meters', 'streamacolumn': 'stream_a_column',
        'streambcolumn': 'stream_b_column', 'keycolumns': 'key_columns',
        'expectedevent': 'expected_event', 'absencetimeoutseconds': 'absence_timeout_seconds',
        'timeoutseconds': 'timeout_seconds',
        'dataprofile': 'data_profile',
        'eventspersecond': 'events_per_second',
        'numpartitions': 'num_partitions',
        'tabletype': 'table_type',
        'clusteringcolumns': 'clustering_columns',
        'partitioncolumns': 'partition_columns',
        'mergekeys': 'merge_keys',
        'maxevents': 'max_events',
        'customschema': 'custom_schema',
        'endpointname': 'endpoint_name',
        'inputcolumns': 'input_columns',
        'maxbatchsize': 'max_batch_size',
        'timeoutms': 'timeout_ms',
        'fallbackvalue': 'fallback_value',
    }
    for key, value in config.items():
        snake_key = _camel_to_snake(key)
        alias = ALIASES.get(key.lower())
        if alias:
            result[alias] = value
        else:
            result[snake_key] = value
        if key != snake_key and key not in result:
            result[key] = value
    return result


def _node_label(node: PipelineNode) -> str:
    """Get display label for a node (label or type-based fallback)."""
    if node.label and node.label.strip():
        return node.label.strip()
    return node.type.replace("-", " ").title()


def _parse_json_config(val) -> list:
    """Parse JSON config (string or list) to list."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else [parsed]
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _duration_to_ms(duration) -> int:
    """Convert duration (string or dict) to milliseconds."""
    if isinstance(duration, (int, float)):
        return int(duration)
    if isinstance(duration, dict):
        val = duration.get("value", duration.get("val", 60))
        unit = str(duration.get("unit", "minutes")).lower()
        if "second" in unit:
            return int(val * 1000)
        if "minute" in unit:
            return int(val * 60 * 1000)
        if "hour" in unit:
            return int(val * 3600 * 1000)
        return int(val * 60000)
    return _parse_duration_to_ms(str(duration))


def _format_duration(duration) -> str:
    """Format duration (string or dict) to human-readable string."""
    if isinstance(duration, str) and duration:
        return duration
    if isinstance(duration, dict):
        val = duration.get("value", duration.get("val", 10))
        unit = duration.get("unit", "seconds")
        return f"{val} {unit}"
    return str(duration) if duration else "10 seconds"


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
    config = _normalize_config(node.config or {})

    # MVP: Implement sequence-detector, absence-detector
    if node.type == "sequence-detector":
        template = _env.get_template("sequence_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        pattern = config.get("pattern", "A -> B -> C")
        steps = [s.strip() for s in re.split(r"\s*->\s*", str(pattern))] if pattern else ["A", "B"]
        steps_json = json.dumps(steps)
        timeout_seconds = config.get("timeout_seconds", 60)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            pattern=pattern,
            steps=steps_json,
            timeout_ms=timeout_seconds * 1000,
            key_column=config.get("key_column", "key"),
            event_time_column=config.get("event_time_column", "event_time"),
        )

    if node.type == "absence-detector":
        template = _env.get_template("absence_detector.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        absence_timeout_seconds = config.get("absence_timeout_seconds", 300)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            expected_event=config.get("expected_event", "heartbeat"),
            absence_timeout_ms=absence_timeout_seconds * 1000,
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
        safe_id = node.id.replace("-", "_")
        bootstrap = config.get("bootstrap_servers", "localhost:9092")
        topic = config.get("topic", "events")
        starting = config.get("starting_offset", "latest")
        return f"""# Kafka source: {node.id}
df_{safe_id} = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", "{bootstrap}")
    .option("subscribe", "{topic}")
    .option("startingOffsets", "{starting}")
    .load()
    .selectExpr(
        "CAST(key AS STRING) AS key",
        "CAST(value AS STRING) AS value",
        "topic",
        "partition",
        "offset",
        "timestamp AS event_time",
        "timestampType"
    )
)
"""

    if node.type == "stream-simulator":
        template = _env.get_template("stream_simulator.py.j2")
        return template.render(
            node_id=node.id,
            data_profile=config.get("data_profile", "iot-sensors"),
            events_per_second=config.get("events_per_second", 10),
            num_partitions=config.get("num_partitions"),
        )

    if node.type == "filter":
        upstream = _get_upstream_var(node, pipeline)
        return f"""# Filter for {node.id}
df_{node.id.replace("-", "_")} = {upstream}.filter("{config.get('condition', '1=1')}")
"""

    if node.type == "delta-table-sink":
        upstream = _get_upstream_var(node, pipeline)
        safe_id = node.id.replace("-", "_")
        catalog = config.get("catalog", "main")
        schema = config.get("schema", "default")
        table = config.get("table_name", "output_table")
        checkpoint = config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}")
        mode = config.get("output_mode", "append")
        return f"""# Delta sink: {node.id}
query_{safe_id} = (
    {upstream}
    .writeStream
    .format("delta")
    .outputMode("{mode}")
    .option("checkpointLocation", "{checkpoint}")
    .toTable("{catalog}.{schema}.{table}")
)
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

    if node.type == "ml-model-endpoint":
        template = _env.get_template("ml_model_endpoint.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        input_cols = config.get("input_columns", ["value"])
        if isinstance(input_cols, str):
            input_cols = [c.strip() for c in input_cols.split(",")]
        input_columns_py = ", ".join(f'"{c}"' for c in input_cols)
        input_columns_expr = ", ".join(f'F.col("{c}")' for c in input_cols)
        output_type_map = {
            "STRING": "StringType()", "DOUBLE": "DoubleType()",
            "BOOLEAN": "BooleanType()", "LONG": "LongType()",
            "STRUCT": "StringType()",
        }
        output_type = output_type_map.get(config.get("output_type", "DOUBLE"), "DoubleType()")
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            endpoint_name=config.get("endpoint_name", "my-model"),
            input_columns_py=input_columns_py,
            input_columns_expr=input_columns_expr,
            output_column=config.get("output_column", "prediction"),
            output_type=output_type,
            max_batch_size=config.get("max_batch_size", 100),
            timeout_ms=config.get("timeout_ms", 30000),
            fallback_value=config.get("fallback_value", "None"),
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

    if node.type in ("lakehouse-sink", "lakebase-sink"):
        tpl_name = "lakebase_sink.py.j2" if node.type == "lakebase-sink" else "lakehouse_sink.py.j2"
        template = _env.get_template(tpl_name)
        upstream = _get_upstream_var(node, pipeline)
        merge_keys_raw = config.get("merge_keys", [])
        if isinstance(merge_keys_raw, str):
            merge_keys_raw = [k.strip() for k in merge_keys_raw.split(",")]
        merge_keys_py = ", ".join(f'"{k}"' for k in merge_keys_raw)
        partition_cols = config.get("partition_columns")
        if isinstance(partition_cols, list):
            partition_cols = ", ".join(f'"{c}"' for c in partition_cols)
        return template.render(
            node_id=node.id,
            upstream_var=upstream,
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "lakehouse_table"),
            write_mode=config.get("write_mode", config.get("output_mode", "append")),
            merge_keys=merge_keys_py,
            partition_columns=partition_cols,
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "state-machine":
        tpl = _env.get_template("state_machine.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        states = _parse_json_config(config.get("states", "[]")) or ["s0"]
        transitions = _parse_json_config(config.get("transitions", "[]"))
        terminal_states = [s.strip() for s in str(config.get("terminal_states", "")).split(",") if s.strip()]
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            upstream_var=upstream,
            states=states, transitions=transitions,
            key_column=config.get("key_column", "entity_id"),
            emit_on=config.get("emit_on", "transition"),
            terminal_states=terminal_states,
            state_timeout=config.get("state_timeout", ""),
        )

    if node.type == "heartbeat-liveness":
        tpl = _env.get_template("heartbeat_liveness.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        expected_interval = config.get("expected_interval", "1 minute")
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            upstream_var=upstream,
            entity_key=config.get("entity_key", "device_id"),
            expected_interval=expected_interval,
            expected_interval_ms=_duration_to_ms(expected_interval),
            grace_period_ms=_duration_to_ms(config.get("grace_period", 0)),
            output_mode=config.get("output_mode", "dead-only"),
        )

    if node.type == "google-pubsub":
        tpl = _env.get_template("google_pubsub.py.j2")
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            project_id=config.get("project_id", ""),
            subscription_id=config.get("subscription_id", ""),
            credentials_path=config.get("credentials_path", ""),
        )

    if node.type == "split-router":
        tpl = _env.get_template("split_router.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        routes = _parse_json_config(config.get("routes", "[]"))
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            upstream_var=upstream,
            routes=routes,
            default_route=config.get("default_route", "other"),
        )

    if node.type == "watermark":
        tpl = _env.get_template("watermark.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            upstream_var=upstream,
            timestamp_column=config.get("timestamp_column", "event_time"),
            delay_threshold=_format_duration(config.get("delay_threshold", "10 seconds")),
        )

    if node.type == "data-quality-expectations":
        tpl = _env.get_template("data_quality_expectations.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        expectations = _parse_json_config(config.get("expectations", "[]"))
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            upstream_var=upstream,
            expectations=expectations,
        )

    if node.type == "feature-store-sink":
        tpl = _env.get_template("feature_store_sink.py.j2")
        upstream = _get_upstream_var(node, pipeline)
        return tpl.render(
            node_id=node.id, node_label=_node_label(node),
            upstream_var=upstream,
            feature_table_name=config.get("feature_table_name", ""),
            write_mode=config.get("write_mode", "merge"),
            timestamp_key=config.get("timestamp_key", ""),
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
