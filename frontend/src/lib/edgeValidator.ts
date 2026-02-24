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
 * - Target node must not exceed its declared max input count
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

  const sourceDef = NODE_REGISTRY[sourceType];
  const targetDef = NODE_REGISTRY[targetType];

  // Sinks cannot have downstream connections - they have outputs: 0
  if (sourceDef?.outputs === 0) {
    return { valid: false, reason: "Sink nodes cannot have outgoing connections" };
  }

  // Enforce max input count on the target node
  if (targetDef) {
    const maxInputs = targetDef.inputs;
    const existingInputs = edges.filter((e) => e.target === targetNode.id).length;
    if (existingInputs >= maxInputs) {
      if (maxInputs === 1) {
        return {
          valid: false,
          reason: `${targetDef.label} accepts a single input. Use a Union / Merge node to combine streams first.`,
        };
      }
      return {
        valid: false,
        reason: `${targetDef.label} already has the maximum number of inputs (${maxInputs})`,
      };
    }
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

  // Pre-compute incoming edge counts per target node
  const incomingCount = new Map<string, number>();
  for (const e of edges) {
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  }

  return edges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      return { ...edge, data: { ...edge.data, isInvalid: true } };
    }

    const sourceType = sourceNode.data?.type as NodeType | undefined;
    const targetType = targetNode.data?.type as NodeType | undefined;

    if (!sourceType || !targetType) {
      return { ...edge, data: { ...edge.data, isInvalid: true, invalidReason: "Unknown node type" } };
    }

    // Category-level validation (sinks can't output, sources can't receive, etc.)
    const result = validateConnection(sourceNode, targetNode, []);
    if (!result.valid) {
      return { ...edge, data: { ...edge.data, isInvalid: true, invalidReason: result.reason } };
    }

    // Check if target node exceeds its max input count
    const targetDef = NODE_REGISTRY[targetType];
    if (targetDef) {
      const count = incomingCount.get(edge.target) ?? 0;
      if (count > targetDef.inputs) {
        return {
          ...edge,
          data: {
            ...edge.data,
            isInvalid: true,
            invalidReason: `${targetDef.label} accepts at most ${targetDef.inputs} input(s). Use Union / Merge to combine streams.`,
          },
        };
      }
    }

    // CEP pattern target: ensure it has valid upstream
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
