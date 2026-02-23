"""
SDP (Lakeflow Declarative Pipelines) code generator.

Generates SQL/Python for Databricks Lakeflow from pipeline graphs.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.codegen.graph_utils import get_upstream_nodes, topological_sort
from app.models.pipeline import PipelineDefinition, PipelineNode

# Template directory relative to this file
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "sdp"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
)


def _render_node_snippet(node: PipelineNode, edges: list) -> str:
    """Render the SDP snippet for a single node based on its type."""
    config = node.config or {}

    # MVP: Implement kafka-topic, filter, window-aggregate, delta-table-sink
    if node.type == "kafka-topic":
        template = _env.get_template("kafka_source.sql.j2")
        return template.render(
            node_id=node.id,
            bootstrap_servers=config.get("bootstrap_servers", "localhost:9092"),
            topic=config.get("topic", "events"),
            schema=config.get("schema", "value STRING"),
        )

    def _source_table() -> str:
        upstream = get_upstream_nodes(node.id, edges)
        return upstream[0] if upstream else "source_stream"

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

    # Other node types: TODO placeholder
    return f"# TODO: Implement SDP generation for node type '{node.type}' (id={node.id})\n"


def generate_sdp(pipeline: PipelineDefinition) -> str:
    """
    Generate complete SDP notebook code from pipeline definition.

    Topologically sorts nodes, renders each with appropriate template,
    and combines into a full notebook.
    """
    sorted_ids = topological_sort(pipeline.nodes, pipeline.edges)
    node_map = {n.id: n for n in pipeline.nodes}

    snippets: list[str] = []
    for node_id in sorted_ids:
        node = node_map.get(node_id)
        if node:
            snippets.append(_render_node_snippet(node, pipeline.edges))

    template = _env.get_template("notebook.py.j2")
    return template.render(
        pipeline_name=pipeline.name,
        pipeline_description=pipeline.description or "",
        snippets=snippets,
    )
