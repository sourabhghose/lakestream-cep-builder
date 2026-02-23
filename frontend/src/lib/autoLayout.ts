import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 60;

/**
 * Simple left-to-right auto-layout using topological sort and layer assignment.
 * Does not use dagre - keeps the implementation lightweight.
 */
export function computeLayout(
  nodes: Node[],
  edges: Edge[]
): Node[] {
  if (nodes.length === 0) return nodes;

  const idToNode = new Map<string, Node>();
  for (const n of nodes) idToNode.set(n.id, n);

  const outEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!idToNode.has(e.source) || !idToNode.has(e.target)) continue;
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  // Topological sort (Kahn's algorithm) to get layer order
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (idToNode.has(e.source) && idToNode.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }

  const layers: string[][] = [];
  const layerOf = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if (inDegree.get(n.id) === 0) queue.push(n.id);
  }

  while (queue.length > 0) {
    const layer: string[] = [];
    const nextQueue: string[] = [];
    for (const id of queue) {
      const layerIdx = layers.length;
      layer.push(id);
      layerOf.set(id, layerIdx);
      const outs = outEdges.get(id) ?? [];
      for (const t of outs) {
        const d = (inDegree.get(t) ?? 1) - 1;
        inDegree.set(t, d);
        if (d === 0) nextQueue.push(t);
      }
    }
    layers.push(layer);
    queue.length = 0;
    queue.push(...nextQueue);
  }

  // Nodes not reached by BFS (cycles or disconnected) get max layer
  for (const n of nodes) {
    if (!layerOf.has(n.id)) {
      const maxLayer = layers.length;
      layerOf.set(n.id, maxLayer);
      if (!layers[maxLayer]) layers[maxLayer] = [];
      layers[maxLayer].push(n.id);
    }
  }

  // Assign positions: x by layer, y centered within layer
  const result: Node[] = [];
  for (const n of nodes) {
    const layerIdx = layerOf.get(n.id) ?? 0;
    const layer = layers[layerIdx] ?? [n.id];
    const idxInLayer = layer.indexOf(n.id);
    const x = layerIdx * (NODE_WIDTH + HORIZONTAL_GAP);
    const y = idxInLayer * (NODE_HEIGHT + VERTICAL_GAP);
    result.push({
      ...n,
      position: { x, y },
    });
  }

  return result;
}
