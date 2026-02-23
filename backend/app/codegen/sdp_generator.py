"""
SDP (Lakeflow Declarative Pipelines) code generator.

Generates SQL/Python for Databricks Lakeflow from pipeline graphs.
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

# Template directory relative to this file
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "sdp"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
)


def _sanitize_python_id(node_id: str) -> str:
    """Convert node ID to valid Python identifier (e.g. kafka-sink-1 -> kafka_sink_1)."""
    return node_id.replace("-", "_").replace(".", "_")


def _node_label(node: PipelineNode) -> str:
    """Get display label for a node (label or type-based fallback)."""
    if node.label and node.label.strip():
        return node.label.strip()
    # Fallback: "kafka-topic" -> "Kafka Topic"
    return node.type.replace("-", " ").title()


def _render_node_snippet(node: PipelineNode, edges: list) -> str:
    """Render the SDP snippet for a single node based on its type."""
    config = _normalize_config(node.config or {})

    def _source_table() -> str:
        upstream = get_upstream_nodes(node.id, edges)
        return upstream[0] if upstream else "source_stream"

    def _source_tables() -> list[str]:
        return get_upstream_nodes(node.id, edges)

    # Sources
    if node.type == "kafka-topic":
        template = _env.get_template("kafka_source.sql.j2")
        return template.render(
            node_id=node.id,
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "events"),
            schema=config.get("schema", "value STRING"),
        )

    if node.type == "delta-table-source":
        template = _env.get_template("delta_table_source.sql.j2")
        return template.render(
            node_id=node.id,
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "source_table"),
        )

    if node.type == "auto-loader":
        template = _env.get_template("auto_loader.sql.j2")
        return template.render(
            node_id=node.id,
            path=config.get("path", "/path/to/data"),
            format=config.get("format", "json"),
            schema=config.get("schema", "value STRING"),
        )

    if node.type == "cdc-stream":
        template = _env.get_template("cdc_stream.sql.j2")
        return template.render(
            node_id=node.id,
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
            node_id=node.id,
            condition=config.get("condition", "1=1"),
            source_table=config.get("source_table") or _source_table(),
        )

    if node.type == "window-aggregate":
        template = _env.get_template("window_aggregate.sql.j2")
        return template.render(
            node_id=node.id,
            source_table=config.get("source_table") or _source_table(),
            window_duration=config.get("window_duration", "10 minutes"),
            slide_duration=config.get("slide_duration", "5 minutes"),
            watermark_column=config.get("watermark_column", "event_time"),
            aggregation=config.get("aggregation", "COUNT(*) as cnt"),
        )

    if node.type == "map-select":
        template = _env.get_template("map_select.sql.j2")
        return template.render(
            node_id=node.id,
            expression=config.get("expression", "*"),
            source_table=config.get("source_table") or _source_table(),
        )

    if node.type == "flatten-explode":
        template = _env.get_template("flatten_explode.sql.j2")
        return template.render(
            node_id=node.id,
            array_column=config.get("array_column", "items"),
            alias=config.get("alias", "item"),
            source_table=config.get("source_table") or _source_table(),
        )

    if node.type == "lookup-enrichment":
        template = _env.get_template("lookup_enrichment.sql.j2")
        return template.render(
            node_id=node.id,
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
            node_id=node.id,
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
            node_id=node.id,
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
            node_id=node.id,
            stream_a=config.get("stream_a") or (upstream[0] if len(upstream) > 0 else "stream_a"),
            stream_b=config.get("stream_b") or (upstream[1] if len(upstream) > 1 else "stream_b"),
        )

    if node.type == "rename-cast":
        template = _env.get_template("rename_cast.sql.j2")
        return template.render(
            node_id=node.id,
            expression=config.get("expression", "col1 AS new_name, CAST(col2 AS INT) AS col2"),
            source_table=config.get("source_table") or _source_table(),
        )

    # Sinks
    if node.type == "delta-table-sink":
        template = _env.get_template("delta_sink.sql.j2")
        return template.render(
            node_id=node.id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
            checkpoint_location=config.get("checkpoint_location", f"/tmp/checkpoints/{node.id}"),
        )

    if node.type == "kafka-topic-sink":
        template = _env.get_template("kafka_topic_sink.py.j2")
        return template.render(
            node_id=node.id,
            source_table=config.get("source_table") or _source_table(),
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "output_topic"),
            select_expr=config.get("select_expr", "*"),
        )

    if node.type == "sql-warehouse-sink":
        template = _env.get_template("sql_warehouse_sink.sql.j2")
        return template.render(
            node_id=node.id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
            warehouse_id=config.get("warehouse_id", ""),
        )

    if node.type == "unity-catalog-table-sink":
        template = _env.get_template("unity_catalog_table_sink.sql.j2")
        return template.render(
            node_id=node.id,
            source_table=config.get("source_table") or _source_table(),
            catalog=config.get("catalog", "main"),
            schema=config.get("schema", "default"),
            table_name=config.get("table_name", "output_table"),
        )

    if node.type == "rest-webhook-sink":
        template = _env.get_template("rest_webhook_sink.py.j2")
        return template.render(
            node_id=node.id,
            flow_func_name=_sanitize_python_id(node.id),
            source_table=config.get("source_table") or _source_table(),
            webhook_url=config.get("webhook_url", "https://example.com/webhook"),
            headers=config.get("headers", '{"Content-Type": "application/json"}'),
        )

    if node.type == "slack-teams-pagerduty":
        template = _env.get_template("slack_teams_pagerduty.py.j2")
        return template.render(
            node_id=node.id,
            flow_func_name=_sanitize_python_id(node.id),
            source_table=config.get("source_table") or _source_table(),
            webhook_url=config.get("webhook_url", "https://hooks.slack.com/services/xxx"),
        )

    if node.type == "email-sink":
        template = _env.get_template("email_sink.py.j2")
        return template.render(
            node_id=node.id,
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

    if node.type == "dead-letter-queue":
        template = _env.get_template("dead_letter_queue.sql.j2")
        return template.render(
            node_id=node.id,
            source_table=config.get("source_table") or _source_table(),
            constraint_name=config.get("constraint_name", "valid_data"),
            expect_condition=config.get("expect_condition", "value IS NOT NULL"),
        )

    return f"# TODO: Implement SDP generation for node type '{node.type}' (id={node.id})\n"


def generate_sdp(pipeline: PipelineDefinition) -> str:
    """
    Generate complete SDP notebook code from pipeline definition.

    Topologically sorts nodes, renders each with appropriate template,
    and combines into a full notebook.
    """
    sorted_ids = topological_sort(pipeline.nodes, pipeline.edges)
    node_map = {n.id: n for n in pipeline.nodes}

    # Node types that generate Python (not SQL) snippets
    _PYTHON_NODE_TYPES = {"kafka-topic-sink", "rest-webhook-sink", "slack-teams-pagerduty", "email-sink"}

    snippets: list[str] = []
    for node_id in sorted_ids:
        node = node_map.get(node_id)
        if node:
            raw = _render_node_snippet(node, pipeline.edges)
            prefix = "#" if node.type in _PYTHON_NODE_TYPES else "--"
            label = _node_label(node)
            annotation = f"{prefix} [node: {node.id}] {label}\n"
            snippets.append(annotation + raw)

    template = _env.get_template("notebook.py.j2")
    return template.render(
        pipeline_name=pipeline.name,
        pipeline_description=pipeline.description or "",
        snippets=snippets,
    )
