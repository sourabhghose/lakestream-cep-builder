import type { Node, Edge } from "@xyflow/react";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import type { NodeType } from "@/types/nodes";

export type NodeCategory = "source" | "cep-pattern" | "transform" | "sink";

function getNodeCategory(nodeType: NodeType): NodeCategory {
  const def = NODE_REGISTRY[nodeType];
  if (!def) return "transform";
  const cat = def.category;
  if (cat === "cep-pattern") return "cep-pattern";
  return (cat ?? "transform") as NodeCategory;
}

/**
 * Validates if a connection from sourceNode to targetNode is semantically valid.
 * Rules:
 * - Sources can only connect TO: Transforms, CEP patterns, or Sinks
 * - CEP patterns must have a Source or Transform upstream (validated when connecting TO them)
 * - Transforms can connect to: Transforms, CEP patterns, Sinks
 * - Sinks cannot have downstream connections (they are terminal nodes)
 */
export function validateConnection(
  sourceNode: Node,
  targetNode: Node,
  edges: Edge[]
): { valid: boolean; reason?: string } {
  const sourceType = sourceNode.data?.type as NodeType | undefined;
  const targetType = targetNode.data?.type as NodeType | undefined;

  if (!sourceType || !targetType) {
    return { valid: false, reason: "Unknown node type" };
  }

  const sourceCat = getNodeCategory(sourceType);
  const targetCat = getNodeCategory(targetType);

  // Sinks cannot have downstream connections - they have outputs: 0
  const sourceDef = NODE_REGISTRY[sourceType];
  if (sourceDef?.outputs === 0) {
    return { valid: false, reason: "Sink nodes cannot have outgoing connections" };
  }

  // Sources can connect to: Transforms, CEP patterns, Sinks
  if (sourceCat === "source") {
    if (targetCat === "source") {
      return { valid: false, reason: "Sources cannot connect to other sources" };
    }
    return { valid: true };
  }

  // Transforms can connect to: Transforms, CEP patterns, Sinks
  if (sourceCat === "transform") {
    if (targetCat === "source") {
      return { valid: false, reason: "Transforms cannot connect to sources" };
    }
    return { valid: true };
  }

  // CEP patterns can connect to: Transforms, CEP patterns, Sinks
  if (sourceCat === "cep-pattern") {
    if (targetCat === "source") {
      return { valid: false, reason: "CEP patterns cannot connect to sources" };
    }
    return { valid: true };
  }

  return { valid: false, reason: "Invalid connection" };
}

/**
 * Validates that a CEP pattern node has a valid upstream (Source or Transform).
 * Call this when the target of a connection is a CEP pattern.
 */
export function cepPatternHasValidUpstream(
  targetNode: Node,
  edges: Edge[],
  nodes: Node[]
): boolean {
  const targetId = targetNode.id;
  const incomingEdges = edges.filter((e) => e.target === targetId);
  for (const edge of incomingEdges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const sourceType = sourceNode.data?.type as NodeType | undefined;
    if (!sourceType) continue;
    const sourceCat = getNodeCategory(sourceType);
    if (sourceCat === "source" || sourceCat === "transform" || sourceCat === "cep-pattern") {
      return true;
    }
  }
  return false;
}

/**
 * Marks edges with isInvalid based on semantic validation.
 * Returns edges with updated data.
 */
export function markInvalidEdges(
  nodes: Node[],
  edges: Edge[]
): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return edges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      return { ...edge, data: { ...edge.data, isInvalid: true } };
    }

    const result = validateConnection(sourceNode, targetNode, edges);

    if (!result.valid) {
      return { ...edge, data: { ...edge.data, isInvalid: true, invalidReason: result.reason } };
    }

    // CEP pattern target: ensure it has valid upstream
    const targetType = targetNode.data?.type as NodeType | undefined;
    if (targetType) {
      const targetCat = getNodeCategory(targetType);
      if (targetCat === "cep-pattern") {
        const hasValid = cepPatternHasValidUpstream(targetNode, edges, nodes);
        if (!hasValid) {
          return { ...edge, data: { ...edge.data, isInvalid: true, invalidReason: "CEP patterns require a Source or Transform upstream" } };
        }
      }
    }

    return { ...edge, data: { ...(edge.data || {}), isInvalid: false } };
  });
}
