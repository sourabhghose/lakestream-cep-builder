import type { Node, Edge } from "@xyflow/react";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { hasNodeConfigError } from "@/lib/configValidator";
import type { NodeType } from "@/types/nodes";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  nodeId?: string;
  message: string;
  fixSuggestion?: string;
}

type NodeCategory = "source" | "cep-pattern" | "transform" | "sink";

const ALERT_NOTIFICATION_SINKS: NodeType[] = [
  "slack-teams-pagerduty",
  "email-sink",
];

function getNodeCategory(nodeType: NodeType): NodeCategory {
  const def = NODE_REGISTRY[nodeType];
  if (!def) return "transform";
  const cat = def.category;
  if (cat === "cep-pattern") return "cep-pattern";
  return (cat ?? "transform") as NodeCategory;
}

function getNodeLabel(node: Node): string {
  return String(node.data?.label ?? node.id);
}

function hasCycle(nodes: Node[], edges: Edge[]): boolean {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const outEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(id: string): boolean {
    visited.add(id);
    recursionStack.add(id);
    const targets = outEdges.get(id) ?? [];
    for (const t of targets) {
      if (!visited.has(t)) {
        if (dfs(t)) return true;
      } else if (recursionStack.has(t)) {
        return true;
      }
    }
    recursionStack.delete(id);
    return false;
  }

  for (const id of Array.from(nodeIds)) {
    if (!visited.has(id) && dfs(id)) return true;
  }
  return false;
}

function getDownstreamSinks(
  nodeId: string,
  edges: Edge[],
  nodes: Node[]
): Node[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  const sinks: Node[] = [];
  const visited = new Set<string>();

  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const n = nodeMap.get(id);
    if (n) {
      const cat = getNodeCategory(n.data?.type as NodeType);
      if (cat === "sink") {
        sinks.push(n);
        return;
      }
    }
    for (const t of outEdges.get(id) ?? []) {
      dfs(t);
    }
  }

  for (const t of outEdges.get(nodeId) ?? []) {
    dfs(t);
  }
  return sinks;
}

function configsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) return false;
  }
  return true;
}

export function validatePipeline(
  nodes: Node[],
  edges: Edge[],
  nodeRegistry: typeof NODE_REGISTRY
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));

  const sourceNodes = nodes.filter(
    (n) => getNodeCategory(n.data?.type as NodeType) === "source"
  );
  const sinkNodes = nodes.filter(
    (n) => getNodeCategory(n.data?.type as NodeType) === "sink"
  );

  // ERROR: Pipeline has no source nodes
  if (sourceNodes.length === 0) {
    issues.push({
      severity: "error",
      message: "Pipeline has no source nodes",
      fixSuggestion: "Add at least one source node (e.g. Kafka, Delta Table, Auto Loader)",
    });
  }

  // ERROR: Pipeline has no sink nodes
  if (sinkNodes.length === 0) {
    issues.push({
      severity: "error",
      message: "Pipeline has no sink nodes",
      fixSuggestion: "Add at least one sink node (e.g. Delta Table Sink, Kafka Sink)",
    });
  }

  const outgoing = new Map<string, Edge[]>();
  const incoming = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }

  // ERROR: Source node has no outgoing edges (disconnected)
  for (const n of sourceNodes) {
    const out = outgoing.get(n.id) ?? [];
    if (out.length === 0) {
      issues.push({
        severity: "error",
        nodeId: n.id,
        message: `Source node "${getNodeLabel(n)}" has no outgoing edges`,
        fixSuggestion: "Connect this source to a transform, CEP pattern, or sink",
      });
    }
  }

  // ERROR: Sink node has no incoming edges (disconnected)
  for (const n of sinkNodes) {
    const inc = incoming.get(n.id) ?? [];
    if (inc.length === 0) {
      issues.push({
        severity: "error",
        nodeId: n.id,
        message: `Sink node "${getNodeLabel(n)}" has no incoming edges`,
        fixSuggestion: "Connect a transform or CEP pattern to this sink",
      });
    }
  }

  // ERROR: Node has required config fields that are empty/missing
  for (const n of nodes) {
    if (hasNodeConfigError(n)) {
      issues.push({
        severity: "error",
        nodeId: n.id,
        message: `Node "${getNodeLabel(n)}" has required config fields that are empty or missing`,
        fixSuggestion: "Open the node config and fill in all required fields",
      });
    }
  }

  // ERROR: Graph has cycles
  if (hasCycle(nodes, edges)) {
    issues.push({
      severity: "error",
      message: "Pipeline graph has cycles (would cause infinite loop)",
      fixSuggestion: "Remove circular connections between nodes",
    });
  }

  const connectedNodeIds = new Set<string>();
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    }
  }

  // WARNING: Node has no edges at all (orphan node)
  for (const n of nodes) {
    if (!connectedNodeIds.has(n.id)) {
      issues.push({
        severity: "warning",
        nodeId: n.id,
        message: `Node "${getNodeLabel(n)}" has no edges (orphan)`,
        fixSuggestion: "Connect this node to the pipeline or remove it",
      });
    }
  }

  // WARNING: Pipeline has > 50 nodes
  if (nodes.length > 50) {
    issues.push({
      severity: "warning",
      message: `Pipeline has ${nodes.length} nodes (may be slow to deploy)`,
      fixSuggestion: "Consider splitting into smaller pipelines",
    });
  }

  // WARNING: Multiple sinks of same type without different configs
  const sinksByType = new Map<NodeType, Node[]>();
  for (const n of sinkNodes) {
    const t = n.data?.type as NodeType;
    if (!sinksByType.has(t)) sinksByType.set(t, []);
    sinksByType.get(t)!.push(n);
  }
  for (const [type, sinks] of Array.from(sinksByType.entries())) {
    if (sinks.length < 2) continue;
    const def = nodeRegistry[type];
    const typeLabel = def?.label ?? type;
    for (let i = 0; i < sinks.length; i++) {
      for (let j = i + 1; j < sinks.length; j++) {
        const a = (sinks[i].data?.config ?? {}) as Record<string, unknown>;
        const b = (sinks[j].data?.config ?? {}) as Record<string, unknown>;
        if (configsEqual(a, b)) {
          issues.push({
            severity: "warning",
            nodeId: sinks[i].id,
            message: `Multiple "${typeLabel}" sinks with identical config`,
            fixSuggestion: "Ensure each sink has distinct configuration (e.g. different tables/topics)",
          });
          break;
        }
      }
    }
  }

  // INFO: CEP pattern node without a downstream alert/notification sink
  const cepNodes = nodes.filter(
    (n) => getNodeCategory(n.data?.type as NodeType) === "cep-pattern"
  );
  for (const n of cepNodes) {
    const downstreamSinks = getDownstreamSinks(n.id, edges, nodes);
    const hasAlertSink = downstreamSinks.some((s) =>
      ALERT_NOTIFICATION_SINKS.includes(s.data?.type as NodeType)
    );
    if (!hasAlertSink) {
      issues.push({
        severity: "info",
        nodeId: n.id,
        message: `CEP pattern "${getNodeLabel(n)}" has no downstream alert/notification sink`,
        fixSuggestion: "Consider adding Slack, Teams, PagerDuty, or Email sink for alerts",
      });
    }
  }

  // INFO: Using SSS-only nodes — pipeline will require Spark Structured Streaming
  const hasSssOnly = nodes.some((n) => {
    const def = nodeRegistry[n.data?.type as NodeType];
    return def?.codeTarget === "sss";
  });
  if (hasSssOnly) {
    issues.push({
      severity: "info",
      message: "Using SSS-only nodes — pipeline will require Spark Structured Streaming",
      fixSuggestion: "Deploy with SSS code target (custom Python sources/processors)",
    });
  }

  // INFO: Using SDP-only nodes — MATCH_RECOGNIZE requires DLT
  const hasSdpOnly = nodes.some((n) => {
    const def = nodeRegistry[n.data?.type as NodeType];
    return def?.codeTarget === "sdp";
  });
  if (hasSdpOnly) {
    issues.push({
      severity: "info",
      message: "Using SDP-only nodes — MATCH_RECOGNIZE requires DLT",
      fixSuggestion: "Deploy with DLT (Delta Live Tables) for MATCH_RECOGNIZE SQL",
    });
  }

  return issues;
}
