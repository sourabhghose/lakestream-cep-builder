"""
SDP (Lakeflow Declarative Pipelines) code generator.

Generates SQL or Python DLT notebooks for Databricks Lakeflow from pipeline
graphs.  When the pipeline contains a stream-simulator node, a Python DLT
notebook is generated (because DLT SQL does not support the Spark rate
streaming source).  Otherwise a pure-SQL DLT notebook is produced.
"""

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.codegen.graph_utils import get_upstream_nodes, topological_sort
from app.models.pipeline import PipelineDefinition, PipelineNode


def _camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    s1 = re.sub(r'([A-Z])', r'_\1', name)
    return s1.lower().lstrip('_')


def _normalize_config(config: dict) -> dict:
    """Normalize config keys from frontend camelCase to generator snake_case.
    Also handles common aliases (e.g., 'topics' -> 'topic')."""
    if not config:
        return {}
    result = {}
    ALIASES = {
        'topics': 'topic',
        'bootstrapservers': 'bootstrap_servers',
        'securityprotocol': 'security_protocol',
        'saslmechanism': 'sasl_mechanism',
        'saslusername': 'sasl_username',
        'saslpassword': 'sasl_password',
        'ssltruststoretype': 'ssl_truststore_type',
        'ssltruststorelocation': 'ssl_truststore_location',
        'tablename': 'table_name',
        'keycolumn': 'key_column',
        'valuecolumn': 'value_column',
        'eventtimecolumn': 'event_time_column',
        'windowduration': 'window_duration',
        'slideduration': 'slide_duration',
        'watermarkcolumn': 'watermark_column',
        'watermarkdelay': 'watermark_delay',
        'checkpointlocation': 'checkpoint_location',
        'outputmode': 'output_mode',
        'deserializationformat': 'deserialization_format',
        'consumergroup': 'consumer_group',
        'startingoffset': 'starting_offset',
        'contiguitymode': 'contiguity_mode',
        'withinduration': 'within_duration',
        'ratethreshold': 'rate_threshold',
        'rateunit': 'rate_unit',
        'gapduration': 'gap_duration',
        'numconsecutive': 'num_consecutive',
        'minsamples': 'min_samples',
        'scdtype': 'scd_type',
        'sequenceby': 'sequence_by',
        'applyasdelete': 'apply_as_delete',
        'joinkey': 'join_key',
        'lookuptable': 'lookup_table',
        'lookupkey': 'lookup_key',
        'lookupcolumns': 'lookup_columns',
        'joinkeyb': 'join_key_b',
        'joinkeya': 'join_key_a',
        'selectexpression': 'select_expression',
        'watermarkcolumna': 'watermark_column_a',
        'watermarkcolumnb': 'watermark_column_b',
        'statictable': 'static_table',
        'statickey': 'static_key',
        'selectexpr': 'select_expr',
        'arraycolumn': 'array_column',
        'webhookurl': 'webhook_url',
        'smtphost': 'smtp_host',
        'smtpport': 'smtp_port',
        'smtpuser': 'smtp_user',
        'smtppassword': 'smtp_password',
        'fromemail': 'from_email',
        'toemail': 'to_email',
        'subjectprefix': 'subject_prefix',
        'constraintname': 'constraint_name',
        'expectcondition': 'expect_condition',
        'warehouseid': 'warehouse_id',
        'dlqtable': 'dlq_table',
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
        # Check aliases
        alias = ALIASES.get(key.lower())
        if alias:
            result[alias] = value
        else:
            result[snake_key] = value
        # Also keep original for backward compat
        if key != snake_key and key not in result:
            result[key] = value
    return result

# Template directories relative to this file
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "sdp"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
)

_PY_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "sdp_py"
_py_env = Environment(
    loader=FileSystemLoader(str(_PY_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
)
_py_env.filters["pyvar"] = lambda s: str(s).replace("-", "_")


def _parse_json_config(val) -> list:
    """Parse JSON config (string or list) to list."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            import json
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else [parsed]
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _sanitize_sql_id(node_id: str) -> str:
    """Convert node ID to valid SQL/Python identifier (e.g. kafka-sink-1 -> kafka_sink_1)."""
    return node_id.replace("-", "_").replace(".", "_")


_sanitize_python_id = _sanitize_sql_id


def _node_label(node: PipelineNode) -> str:
    """Get display label for a node (label or type-based fallback)."""
    if node.label and node.label.strip():
        return node.label.strip()
    # Fallback: "kafka-topic" -> "Kafka Topic"
    return node.type.replace("-", " ").title()


def _build_jaas_config(security_protocol: str, sasl_mechanism: str, username: str, password: str) -> str:
    """Build JAAS config string for Kafka SASL authentication."""
    if security_protocol not in ("SASL_SSL", "SASL_PLAINTEXT") or not username:
        return ""
    jaas_class = {
        "PLAIN": "org.apache.kafka.common.security.plain.PlainLoginModule",
        "SCRAM-SHA-256": "org.apache.kafka.common.security.scram.ScramLoginModule",
        "SCRAM-SHA-512": "org.apache.kafka.common.security.scram.ScramLoginModule",
    }.get(sasl_mechanism, "org.apache.kafka.common.security.plain.PlainLoginModule")
    return f'{jaas_class} required username="{username}" password="{password}";'


def _render_node_snippet(node: PipelineNode, edges: list, use_mv: bool = False) -> str:
    """Render the SDP snippet for a single node based on its type.
    
    use_mv: when True, downstream tables use MATERIALIZED VIEW instead of
    STREAMING TABLE (required when upstream is a materialized view).
    """
    raw = _render_node_snippet_inner(node, edges)
    if use_mv:
        raw = raw.replace("STREAMING TABLE", "MATERIALIZED VIEW")
    return raw


def _render_node_snippet_inner(node: PipelineNode, edges: list) -> str:
    """Core rendering logic for a single node."""
    config = _normalize_config(node.config or {})
    safe_id = _sanitize_sql_id(node.id)

    def _source_table() -> str:
        upstream = get_upstream_nodes(node.id, edges)
        return _sanitize_sql_id(upstream[0]) if upstream else "source_stream"

    def _source_tables() -> list[str]:
        return [_sanitize_sql_id(u) for u in get_upstream_nodes(node.id, edges)]

    # Sources
    if node.type == "kafka-topic":
        template = _env.get_template("kafka_source.sql.j2")
        security_protocol = config.get("security_protocol", "PLAINTEXT")
        sasl_mechanism = config.get("sasl_mechanism", "")
        sasl_username = config.get("sasl_username", "")
        sasl_password = config.get("sasl_password", "")
        sasl_jaas_config = _build_jaas_config(security_protocol, sasl_mechanism, sasl_username, sasl_password)
        return template.render(
            node_id=safe_id,
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "events"),
            schema=config.get("schema", "value STRING"),
            security_protocol=security_protocol if security_protocol != "PLAINTEXT" else "",
            sasl_mechanism=sasl_mechanism if security_protocol in ("SASL_SSL", "SASL_PLAINTEXT") else "",
            sasl_jaas_config=sasl_jaas_config.replace("'", "\\'") if sasl_jaas_config else "",
            ssl_truststore_type=config.get("ssl_truststore_type", "") if "SSL" in security_protocol else "",
            ssl_truststore_location=config.get("ssl_truststore_location", "") if "SSL" in security_protocol else "",
            consumer_group=config.get("consumer_group", ""),
            starting_offset=config.get("starting_offset", "latest"),
        )

    if node.type == "delta-table-source":
        template = _env.get_template("delta_table_source.sql.j2")
        return template.render(
            node_id=safe_id,
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "source_table"),
        )

    if node.type == "auto-loader":
        template = _env.get_template("auto_loader.sql.j2")
        return template.render(
            node_id=safe_id,
            path=config.get("path", "/path/to/data"),
            format=config.get("format", "json"),
            schema=config.get("schema", "value STRING"),
        )

    if node.type == "stream-simulator":
        template = _env.get_template("stream_simulator.sql.j2")
        return template.render(
            node_id=safe_id,
            data_profile=config.get("data_profile", "iot-sensors"),
            events_per_second=config.get("events_per_second", 10),
            num_partitions=config.get("num_partitions"),
        )

    if node.type == "cdc-stream":
        template = _env.get_template("cdc_stream.sql.j2")
        return template.render(
            node_id=safe_id,
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "cdc_events"),
            schema=config.get("schema", "value STRING"),
            keys=config.get("keys", "id"),
            sequence_by=config.get("sequence_by", "sequence_num"),
            apply_as_delete=config.get("apply_as_delete", "op = 'd'"),
            scd_type=config.get("scd_type", "1"),
        )

    # Transforms
    if node.type == "filter":
        template = _env.get_template("filter.sql.j2")
        return template.render(
            node_id=safe_id,
            condition=config.get("condition", "1=1"),
            source_table=config.get("source_table") or _source_table(),
        )

    if node.type == "window-aggregate":
        template = _env.get_template("window_aggregate.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            window_duration=config.get("window_duration", "10 minutes"),
            slide_duration=config.get("slide_duration", "5 minutes"),
            watermark_column=config.get("watermark_column", "event_time"),
            aggregation=config.get("aggregation", "COUNT(*) as cnt"),
        )

    if node.type == "map-select":
        template = _env.get_template("map_select.sql.j2")
        return template.render(
            node_id=safe_id,
            expression=config.get("expression", "*"),
            source_table=config.get("source_table") or _source_table(),
        )

    if node.type == "flatten-explode":
        template = _env.get_template("flatten_explode.sql.j2")
        return template.render(
            node_id=safe_id,
            array_column=config.get("array_column", "items"),
            alias=config.get("alias", "item"),
            source_table=config.get("source_table") or _source_table(),
        )

    if node.type == "lookup-enrichment":
        template = _env.get_template("lookup_enrichment.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            lookup_table=config.get("lookup_table", "lookup.ref_table"),
            join_key=config.get("join_key", "key"),
            lookup_key=config.get("lookup_key", "key"),
            lookup_columns=config.get("lookup_columns", "enriched_col"),
        )

    if node.type == "stream-stream-join":
        upstream = _source_tables()
        template = _env.get_template("stream_stream_join.sql.j2")
        return template.render(
            node_id=safe_id,
            stream_a=config.get("stream_a") or (upstream[0] if len(upstream) > 0 else "stream_a"),
            stream_b=config.get("stream_b") or (upstream[1] if len(upstream) > 1 else "stream_b"),
            select_expression=config.get("select_expression", "a.*, b.*"),
            join_key_a=config.get("join_key_a", "key"),
            join_key_b=config.get("join_key_b", "key"),
            watermark_column_a=config.get("watermark_column_a", "event_time"),
            watermark_column_b=config.get("watermark_column_b", "event_time"),
            watermark_delay=config.get("watermark_delay", "10 minutes"),
        )

    if node.type == "stream-static-join":
        template = _env.get_template("stream_static_join.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            static_table=config.get("static_table", "static.ref_table"),
            select_expression=config.get("select_expression", "a.*, b.enriched_col"),
            join_key=config.get("join_key", "key"),
            static_key=config.get("static_key", "key"),
        )

    if node.type == "union-merge":
        upstream = _source_tables()
        template = _env.get_template("union_merge.sql.j2")
        return template.render(
            node_id=safe_id,
            stream_a=config.get("stream_a") or (upstream[0] if len(upstream) > 0 else "stream_a"),
            stream_b=config.get("stream_b") or (upstream[1] if len(upstream) > 1 else "stream_b"),
        )

    if node.type == "rename-cast":
        template = _env.get_template("rename_cast.sql.j2")
        return template.render(
            node_id=safe_id,
            expression=config.get("expression", "col1 AS new_name, CAST(col2 AS INT) AS col2"),
            source_table=config.get("source_table") or _source_table(),
        )

    # Sinks
    if node.type == "delta-table-sink":
        template = _env.get_template("delta_sink.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{safe_id}"),
        )

    if node.type == "kafka-topic-sink":
        template = _env.get_template("kafka_topic_sink.py.j2")
        sink_security = config.get("security_protocol", "PLAINTEXT")
        sink_sasl_mech = config.get("sasl_mechanism", "")
        sink_jaas = _build_jaas_config(
            sink_security, sink_sasl_mech,
            config.get("sasl_username", ""), config.get("sasl_password", ""),
        )
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "output_topic"),
            select_expr=config.get("select_expr", "*"),
            security_protocol=sink_security if sink_security != "PLAINTEXT" else "",
            sasl_mechanism=sink_sasl_mech if sink_security in ("SASL_SSL", "SASL_PLAINTEXT") else "",
            sasl_jaas_config=sink_jaas,
            ssl_truststore_type=config.get("ssl_truststore_type", "") if "SSL" in sink_security else "",
            ssl_truststore_location=config.get("ssl_truststore_location", "") if "SSL" in sink_security else "",
        )

    if node.type == "sql-warehouse-sink":
        template = _env.get_template("sql_warehouse_sink.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
            warehouse_id=config.get("warehouse_id", ""),
        )

    if node.type == "unity-catalog-table-sink":
        template = _env.get_template("unity_catalog_table_sink.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
        )

    if node.type == "rest-webhook-sink":
        template = _env.get_template("rest_webhook_sink.py.j2")
        return template.render(
            node_id=safe_id,
            flow_func_name=_sanitize_python_id(node.id),
            source_table=config.get("source_table") or _source_table(),
            webhook_url=config.get("webhook_url", "https://example.com/webhook"),
            headers=config.get("headers", '{"Content-Type": "application/json"}'),
        )

    if node.type == "slack-teams-pagerduty":
        template = _env.get_template("slack_teams_pagerduty.py.j2")
        return template.render(
            node_id=safe_id,
            flow_func_name=_sanitize_python_id(node.id),
            source_table=config.get("source_table") or _source_table(),
            webhook_url=config.get("webhook_url", "https://hooks.slack.com/services/xxx"),
        )

    if node.type == "email-sink":
        template = _env.get_template("email_sink.py.j2")
        return template.render(
            node_id=safe_id,
            flow_func_name=_sanitize_python_id(node.id),
            source_table=config.get("source_table") or _source_table(),
            subject_prefix=config.get("subject_prefix", "Alert"),
            from_email=config.get("from_email", "alerts@example.com"),
            to_email=config.get("to_email", "ops@example.com"),
            smtp_host=config.get("smtp_host", "smtp.example.com"),
            smtp_port=config.get("smtp_port", "587"),
            smtp_user=config.get("smtp_user", ""),
            smtp_password=config.get("smtp_password", ""),
        )

    if node.type in ("lakehouse-sink", "lakebase-sink"):
        tpl_name = "lakebase_sink.sql.j2" if node.type == "lakebase-sink" else "lakehouse_sink.sql.j2"
        template = _env.get_template(tpl_name)
        expectations = _parse_json_config(config.get("expectations"))
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "lakehouse_table"),
            table_type=config.get("table_type", "streaming-table"),
            partition_columns=config.get("partition_columns"),
            clustering_columns=config.get("clustering_columns"),
            expectations=expectations,
        )

    if node.type == "google-pubsub":
        tpl = _env.get_template("google_pubsub.sql.j2")
        return tpl.render(
            node_id=safe_id, node_label=_node_label(node),
            project_id=config.get("project_id", ""),
            subscription_id=config.get("subscription_id", ""),
            deserialization_format=config.get("deserialization_format", "json"),
        )

    if node.type == "split-router":
        tpl = _env.get_template("split_router.sql.j2")
        routes = _parse_json_config(config.get("routes", "[]"))
        return tpl.render(
            node_id=safe_id, node_label=_node_label(node),
            upstream_table=_source_table(),
            routes=routes,
            default_route=config.get("default_route", "other"),
        )

    if node.type == "watermark":
        tpl = _env.get_template("watermark.sql.j2")
        return tpl.render(
            node_id=safe_id, node_label=_node_label(node),
            upstream_table=_source_table(),
            timestamp_column=config.get("timestamp_column", "event_time"),
            delay_threshold=config.get("delay_threshold", "10 seconds"),
        )

    if node.type == "data-quality-expectations":
        tpl = _env.get_template("data_quality_expectations.sql.j2")
        expectations = _parse_json_config(config.get("expectations", "[]"))
        return tpl.render(
            node_id=safe_id, node_label=_node_label(node),
            upstream_table=_source_table(),
            expectations=expectations,
        )

    if node.type == "feature-store-sink":
        tpl = _env.get_template("feature_store_sink.sql.j2")
        return tpl.render(
            node_id=safe_id, node_label=_node_label(node),
            upstream_table=_source_table(),
            feature_table_name=config.get("feature_table_name", ""),
        )

    if node.type == "dead-letter-queue":
        template = _env.get_template("dead_letter_queue.sql.j2")
        return template.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            constraint_name=config.get("constraint_name", "valid_data"),
            expect_condition=config.get("expect_condition", "value IS NOT NULL"),
        )

    return f"-- TODO: Implement SDP generation for node type '{node.type}' (id={safe_id})\n"


_MV_NODE_TYPES = {"stream-simulator"}


def _find_mv_nodes(nodes: list[PipelineNode], edges: list) -> set[str]:
    """Find all node IDs that should use MATERIALIZED VIEW.
    
    Starts from nodes that inherently produce MVs (e.g. stream-simulator)
    and propagates to all downstream dependents.
    """
    mv_ids: set[str] = set()
    for n in nodes:
        if n.type in _MV_NODE_TYPES:
            mv_ids.add(n.id)

    changed = True
    while changed:
        changed = False
        for e in edges:
            if e.source in mv_ids and e.target not in mv_ids:
                mv_ids.add(e.target)
                changed = True
    return mv_ids


def _has_stream_simulator(pipeline: PipelineDefinition) -> bool:
    return any(n.type == "stream-simulator" for n in pipeline.nodes)


def has_stream_simulator(pipeline: PipelineDefinition) -> bool:
    """Public API: True when the pipeline uses a stream-simulator source."""
    return _has_stream_simulator(pipeline)


# -- Python DLT template map ------------------------------------------------
_PY_DLT_TEMPLATES: dict[str, str] = {
    "stream-simulator": "stream_simulator.py.j2",
    "filter": "filter.py.j2",
    "delta-table-sink": "delta_sink.py.j2",
    "map-select": "map_select.py.j2",
    "window-aggregate": "window_aggregate.py.j2",
    "rename-cast": "rename_cast.py.j2",
    "flatten-explode": "flatten_explode.py.j2",
    "lookup-enrichment": "lookup_enrichment.py.j2",
    "stream-stream-join": "stream_stream_join.py.j2",
    "stream-static-join": "stream_static_join.py.j2",
    "union-merge": "union_merge.py.j2",
    "dead-letter-queue": "dead_letter_queue.py.j2",
}


def _render_python_dlt_snippet(node: PipelineNode, edges: list) -> str:
    """Render a Python DLT snippet for a single node."""
    config = _normalize_config(node.config or {})
    safe_id = _sanitize_sql_id(node.id)

    def _source_table() -> str:
        upstream = get_upstream_nodes(node.id, edges)
        return _sanitize_sql_id(upstream[0]) if upstream else "source_stream"

    def _source_tables() -> list[str]:
        return [_sanitize_sql_id(u) for u in get_upstream_nodes(node.id, edges)]

    tpl_name = _PY_DLT_TEMPLATES.get(node.type)

    if node.type == "stream-simulator":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            data_profile=config.get("data_profile", "iot-sensors"),
            events_per_second=config.get("events_per_second", 10),
            num_partitions=config.get("num_partitions"),
        )

    if node.type == "filter":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            condition=config.get("condition", "1=1"),
        )

    if node.type == "delta-table-sink":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
        )

    if node.type == "window-aggregate":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            window_duration=config.get("window_duration", "10 minutes"),
            slide_duration=config.get("slide_duration", "5 minutes"),
            watermark_column=config.get("watermark_column", "event_time"),
            aggregation=config.get("aggregation", "COUNT(*) as cnt"),
        )

    if node.type == "map-select":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            expression=config.get("expression", "*"),
        )

    if node.type == "rename-cast":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            expression=config.get("expression", "col1 AS new_name, CAST(col2 AS INT) AS col2"),
        )

    if node.type == "flatten-explode":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            array_column=config.get("array_column", "items"),
            alias=config.get("alias", "item"),
        )

    if node.type == "lookup-enrichment":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            lookup_table=config.get("lookup_table", "lookup.ref_table"),
            join_key=config.get("join_key", "key"),
            lookup_key=config.get("lookup_key", "key"),
        )

    if node.type == "stream-stream-join":
        upstream = _source_tables()
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            stream_a=config.get("stream_a") or (upstream[0] if len(upstream) > 0 else "stream_a"),
            stream_b=config.get("stream_b") or (upstream[1] if len(upstream) > 1 else "stream_b"),
            join_key_a=config.get("join_key_a", "key"),
            join_key_b=config.get("join_key_b", "key"),
        )

    if node.type == "stream-static-join":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            static_table=config.get("static_table", "static.ref_table"),
            join_key=config.get("join_key", "key"),
            static_key=config.get("static_key", "key"),
        )

    if node.type == "union-merge":
        upstream = _source_tables()
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            stream_a=config.get("stream_a") or (upstream[0] if len(upstream) > 0 else "stream_a"),
            stream_b=config.get("stream_b") or (upstream[1] if len(upstream) > 1 else "stream_b"),
        )

    if node.type == "dead-letter-queue":
        tpl = _py_env.get_template(tpl_name)
        return tpl.render(
            node_id=safe_id,
            source_table=config.get("source_table") or _source_table(),
            constraint_name=config.get("constraint_name", "valid_data"),
            expect_condition=config.get("expect_condition", "value IS NOT NULL"),
        )

    # Fallback: use passthrough template for any other node type
    if node.type in (
        "unity-catalog-table-sink", "sql-warehouse-sink",
        "lakehouse-sink", "lakebase-sink",
    ):
        tpl = _py_env.get_template("passthrough.py.j2")
        return tpl.render(
            node_id=safe_id,
            node_type=node.type,
            source_table=config.get("source_table") or _source_table(),
        )

    tpl = _py_env.get_template("passthrough.py.j2")
    return tpl.render(
        node_id=safe_id,
        node_type=node.type,
        source_table=config.get("source_table") or _source_table(),
    )


def generate_sdp_python(pipeline: PipelineDefinition) -> str:
    """Generate a Python DLT notebook (used when pipeline has stream-simulator).

    Uses @dlt.table decorators and spark.readStream for true continuous streaming.
    """
    sorted_ids = topological_sort(pipeline.nodes, pipeline.edges)
    node_map = {n.id: n for n in pipeline.nodes}

    snippets: list[str] = []
    for node_id in sorted_ids:
        node = node_map.get(node_id)
        if node:
            raw = _render_python_dlt_snippet(node, pipeline.edges)
            label = _node_label(node)
            annotation = f"# [node: {node.id}] {label}"
            snippets.append(f"{annotation}\n{raw.rstrip()}")

    cells: list[str] = [
        f"# Databricks notebook source\n# {pipeline.name}\n# {pipeline.description or 'Generated by LakeStream CEP Builder'}",
    ]
    for snippet in snippets:
        cells.append(snippet)

    return "\n\n# COMMAND ----------\n\n".join(cells) + "\n"


def generate_sdp(pipeline: PipelineDefinition) -> str:
    """Generate a DLT notebook from the pipeline definition.

    If the pipeline contains a stream-simulator, a Python DLT notebook is
    produced (continuous streaming via the Spark rate source).  Otherwise a
    pure-SQL DLT notebook is generated.
    """
    if _has_stream_simulator(pipeline):
        return generate_sdp_python(pipeline)

    sorted_ids = topological_sort(pipeline.nodes, pipeline.edges)
    node_map = {n.id: n for n in pipeline.nodes}
    mv_nodes = _find_mv_nodes(pipeline.nodes, pipeline.edges)

    snippets: list[str] = []
    for node_id in sorted_ids:
        node = node_map.get(node_id)
        if node:
            raw = _render_node_snippet(node, pipeline.edges, use_mv=(node.id in mv_nodes))
            label = _node_label(node)
            annotation = f"-- [node: {node.id}] {label}"
            snippets.append(f"{annotation}\n{raw.rstrip()}")

    cells: list[str] = [
        f"-- Databricks notebook source\n-- {pipeline.name}\n-- {pipeline.description or 'Generated by LakeStream CEP Builder'}",
    ]
    for snippet in snippets:
        cells.append(snippet)

    return "\n\n-- COMMAND ----------\n\n".join(cells) + "\n"
