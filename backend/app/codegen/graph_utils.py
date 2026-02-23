"""
Graph utilities for pipeline DAG analysis.

Provides topological sort, upstream/downstream lookups, and validation.
"""

from collections import defaultdict

from app.models.pipeline import PipelineEdge, PipelineNode


def topological_sort(
    nodes: list[PipelineNode], edges: list[PipelineEdge]
) -> list[str]:
    """
    Return node IDs in execution order (topological sort).

    Raises ValueError if the graph contains a cycle.
    """
    node_ids = {n.id for n in nodes}
    if not node_ids:
        return []

    # Build adjacency list (incoming edges)
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        if edge.source in node_ids and edge.target in node_ids:
            adjacency[edge.source].append(edge.target)
            in_degree[edge.target] += 1

    # Kahn's algorithm
    queue = [nid for nid in node_ids if in_degree[nid] == 0]
    result: list[str] = []

    while queue:
        node_id = queue.pop(0)
        result.append(node_id)
        for neighbor in adjacency[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(node_ids):
        raise ValueError("Graph contains a cycle - cannot topological sort")

    return result


def get_upstream_nodes(node_id: str, edges: list[PipelineEdge]) -> list[str]:
    """Return list of upstream node IDs (nodes that feed into this node)."""
    return [e.source for e in edges if e.target == node_id]


def get_downstream_nodes(node_id: str, edges: list[PipelineEdge]) -> list[str]:
    """Return list of downstream node IDs (nodes this node feeds into)."""
    return [e.target for e in edges if e.source == node_id]


def validate_graph(
    nodes: list[PipelineNode], edges: list[PipelineEdge]
) -> list[str]:
    """
    Validate the pipeline graph. Returns list of validation error messages.

    Checks for: cycles, disconnected nodes, invalid edge references.
    """
    errors: list[str] = []
    node_ids = {n.id for n in nodes}

    # Check for duplicate node IDs
    if len(node_ids) != len(nodes):
        errors.append("Duplicate node IDs found")

    # Check edge references
    for edge in edges:
        if edge.source not in node_ids:
            errors.append(f"Edge {edge.id}: source node '{edge.source}' not found")
        if edge.target not in node_ids:
            errors.append(f"Edge {edge.id}: target node '{edge.target}' not found")
        if edge.source == edge.target:
            errors.append(f"Edge {edge.id}: self-loop not allowed")

    # Check for cycles
    try:
        topological_sort(nodes, edges)
    except ValueError:
        errors.append("Graph contains a cycle")

    # Check for disconnected nodes (optional - single source/sink may be valid)
    if nodes and edges:
        reachable: set[str] = set()
        for edge in edges:
            reachable.add(edge.source)
            reachable.add(edge.target)
        disconnected = node_ids - reachable
        if len(disconnected) == len(node_ids):
            errors.append("No edges connect any nodes")
        elif disconnected and len(nodes) > 1:
            errors.append(f"Disconnected nodes: {', '.join(disconnected)}")

    return errors
