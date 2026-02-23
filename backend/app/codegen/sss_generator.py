"""
SSS (Spark Structured Streaming) code generator.

Generates PySpark code with TransformWithState for CEP pattern nodes.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.codegen.graph_utils import topological_sort
from app.models.nodes import NodeCategory, NODE_REGISTRY
from app.models.pipeline import PipelineDefinition, PipelineNode

# Template directory relative to this file
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "sss"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=()),
)


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

    # Other CEP pattern nodes: TODO placeholder
    metadata = NODE_REGISTRY.get(node.type)
    if metadata and metadata["category"] == NodeCategory.CEP_PATTERN:
        return f"# TODO: Implement SSS generation for CEP node type '{node.type}' (id={node.id})\n"

    # Non-CEP nodes: generate standard PySpark equivalents
    if node.type == "kafka-topic":
        return f"""# Kafka source for {node.id}
df_{node.id} = (
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

    # Generic placeholder for other node types
    return f"# TODO: Implement SSS generation for node type '{node.type}' (id={node.id})\n"


def _get_upstream_var(node: PipelineNode, pipeline: PipelineDefinition) -> str:
    """Get the variable name of the upstream node (for chaining)."""
    from app.codegen.graph_utils import get_upstream_nodes

    upstream_ids = get_upstream_nodes(node.id, pipeline.edges)
    if upstream_ids:
        safe_id = upstream_ids[0].replace("-", "_")
        return f"df_{safe_id}"
    return "source"


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
            snippets.append(_render_node_snippet(node, pipeline))

    template = _env.get_template("notebook.py.j2")
    return template.render(
        pipeline_name=pipeline.name,
        pipeline_description=pipeline.description or "",
        snippets=snippets,
    )
