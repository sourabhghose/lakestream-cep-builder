import { create } from "zustand";
import type { Node, Edge, Connection } from "@xyflow/react";
import * as api from "@/lib/api";
import { debounce } from "@/lib/performanceUtils";
import type { CodeAnnotation } from "@/lib/api";
import { markInvalidEdges } from "@/lib/edgeValidator";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { hasNodeConfigError } from "@/lib/configValidator";
import { formatApiError } from "@/lib/errorUtils";
import { useToastStore } from "@/hooks/useToastStore";
import type { NodeType } from "@/types/nodes";

const MAX_HISTORY = 50;

type CodeTarget = "sdp" | "sss" | "hybrid" | null;

/** Parsed node from code parse API (id, type, position, config, label) */
export interface PipelineNodeInput {
  id: string;
  type: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
  label?: string;
}

/** Parsed edge from code parse API */
export interface PipelineEdgeInput {
  id: string;
  source: string;
  target: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

let codeGenTimeout: ReturnType<typeof setTimeout> | undefined;

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

export interface GroupState {
  id: string;
  name: string;
  nodeIds: string[];
  collapsed: boolean;
  position: { x: number; y: number };
  /** Stored when collapsed: original nodes for restoration */
  storedNodes?: Node[];
  /** Stored when collapsed: original edges involving group nodes */
  storedEdges?: Edge[];
}

interface PipelineState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  generatedSdpCode: string;
  generatedSssCode: string;
  sdpAnnotations: CodeAnnotation[];
  sssAnnotations: CodeAnnotation[];
  pipelineName: string;
  pipelineDescription: string;
  isDirty: boolean;
  pipelineId: string | null;
  /** Last saved timestamp (ISO string) for display */
  lastSavedAt: string | null;
  /** Pipeline version from server */
  pipelineVersion: number;
  codeTarget: CodeTarget;
  warnings: string[];
  isGenerating: boolean;
  isSaving: boolean;
  isDeploying: boolean;
  /** Undo stack: past states (oldest first) */
  undoStack: HistoryEntry[];
  /** Redo stack: future states after undo */
  redoStack: HistoryEntry[];
  /** Clipboard for copy/paste (nodes and their internal edges) */
  clipboard: { nodes: Node[]; edges: Edge[] } | null;
  /** Node groups for collapse/expand */
  groups: Record<string, GroupState>;

  addNode: (node: Node) => void;
  loadPipeline: (nodes: Node[], edges: Edge[], name?: string, description?: string) => void;
  resetPipeline: () => void;
  loadPipelineFromServer: (id: string) => Promise<void>;
  syncFromCode: (nodes: PipelineNodeInput[], edges: PipelineEdgeInput[]) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  updateNode: (id: string, data: Partial<Node["data"]>) => void;
  batchUpdateNodes: (updates: Array<{ nodeId: string; data: Record<string, unknown> }>) => void;
  setNodes: (nodes: Node[]) => void;
  /** Toggle inline preview expanded state on a node. Does not set isDirty. */
  toggleNodePreview: (nodeId: string) => void;
  /** Store preview data on a node. Does not set isDirty. */
  setNodePreviewData: (nodeId: string, data: { columns: string[]; rows: (string | number | boolean | null)[][] }) => void;
  /** Apply search highlights to nodes (matchedIds get searchHighlight: true). Does not set isDirty. */
  applySearchHighlights: (matchedIds: Set<string>) => void;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  deselectNode: () => void;
  /** Request pan to node (used by ValidationPanel); cleared after pan */
  panToNodeId: string | null;
  requestPanToNode: (id: string) => void;
  clearPanToNode: () => void;
  deleteSelected: () => void;
  copySelectedNodes: () => void;
  pasteNodes: () => void;
  duplicateSelectedNodes: () => void;
  selectAllNodes: () => void;
  createGroup: (name: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  ungroupNodes: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  getExpandedNodesAndEdges: () => { nodes: Node[]; edges: Edge[] };
  setPipelineName: (name: string) => void;
  setPipelineDescription: (desc: string) => void;
  setGeneratedCode: (sdp: string, sss: string, sdpAnn?: CodeAnnotation[], sssAnn?: CodeAnnotation[]) => void;
  setDirty: (dirty: boolean) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  triggerCodeGen: () => void;
  generateCode: () => Promise<void>;
  validatePipeline: () => ValidationResult;
  savePipeline: () => Promise<void>;
  deployPipeline: (request: {
    pipeline_id: string;
    job_name: string;
    cluster_config?: Record<string, unknown>;
    code_target?: "sdp" | "sss" | "hybrid";
    schedule?: string;
    max_retries?: number;
    checkpoint_location?: string;
    catalog?: string;
    target_schema?: string;
  }) => Promise<{ job_id: string; job_url: string; status: string }>;
}

function cloneState(nodes: Node[], edges: Edge[]): HistoryEntry {
  return {
    nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
    edges: edges.map((e) => ({ ...e })),
  };
}

function withHistoryPush(state: { nodes: Node[]; edges: Edge[]; undoStack: HistoryEntry[]; redoStack: HistoryEntry[] }): Partial<PipelineState> {
  const entry = cloneState(state.nodes, state.edges);
  const undoStack = [...state.undoStack, entry].slice(-MAX_HISTORY);
  return { undoStack, redoStack: [] };
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  generatedSdpCode: "",
  generatedSssCode: "",
  sdpAnnotations: [],
  sssAnnotations: [],
  pipelineName: "Untitled Pipeline",
  pipelineDescription: "",
  isDirty: false,
  pipelineId: null,
  lastSavedAt: null,
  pipelineVersion: 1,
  codeTarget: null,
  warnings: [],
  isGenerating: false,
  isSaving: false,
  isDeploying: false,
  undoStack: [],
  redoStack: [],
  clipboard: null,
  groups: {},

  getExpandedNodesAndEdges: () => {
    const { nodes, edges, groups } = get();
    const collapsedGroups = Object.values(groups).filter((g) => g.collapsed);
    if (collapsedGroups.length === 0) {
      return {
        nodes: nodes.filter((n) => n.type !== "group"),
        edges,
      };
    }
    const groupIds = new Set(collapsedGroups.map((g) => g.id));
    const pipelineNodes = nodes
      .filter((n) => n.type !== "group")
      .concat(
        collapsedGroups.flatMap((g) => g.storedNodes ?? [])
      );
    const pipelineEdges = edges
      .filter((e) => !groupIds.has(e.source) && !groupIds.has(e.target))
      .concat(
        collapsedGroups.flatMap((g) => g.storedEdges ?? [])
      );
    const edgeIds = new Set<string>();
    const dedupedEdges = pipelineEdges.filter((e) => {
      if (edgeIds.has(e.id)) return false;
      edgeIds.add(e.id);
      return true;
    });
    return { nodes: pipelineNodes, edges: dedupedEdges };
  },

  createGroup: (name) =>
    set((state) => {
      const selectedNodes = state.nodes.filter(
        (n) => (n as Node & { selected?: boolean }).selected
      );
      if (selectedNodes.length < 2) return state;
      const selectedIds = new Set(selectedNodes.map((n) => n.id));
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const NODE_WIDTH = 180;
      const NODE_HEIGHT = 80;
      for (const n of selectedNodes) {
        const pos = n.position ?? { x: 0, y: 0 };
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + NODE_WIDTH);
        maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
      }
      const centerX = (minX + maxX) / 2 - 100;
      const centerY = (minY + maxY) / 2 - 40;
      const groupId = `group-${Date.now()}`;
      const internalEdges = state.edges.filter(
        (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
      );
      const externalEdges = state.edges.filter(
        (e) =>
          selectedIds.has(e.source) || selectedIds.has(e.target)
      );
      const storedEdges = externalEdges.concat(internalEdges);
      const newEdges: Edge[] = state.edges.filter(
        (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)
      );
      const outgoing = externalEdges.filter(
        (e) => selectedIds.has(e.source) && !selectedIds.has(e.target)
      );
      const incoming = externalEdges.filter(
        (e) => !selectedIds.has(e.source) && selectedIds.has(e.target)
      );
      for (const e of outgoing) {
        newEdges.push({
          ...e,
          id: `e${groupId}-${e.target}`,
          source: groupId,
          target: e.target,
        });
      }
      for (const e of incoming) {
        newEdges.push({
          ...e,
          id: `e${e.source}-${groupId}`,
          source: e.source,
          target: groupId,
        });
      }
      const newNodes = state.nodes
        .filter((n) => !selectedIds.has(n.id))
        .map((n) => ({ ...n, selected: false }));
      const groupNode: Node = {
        id: groupId,
        type: "group",
        position: { x: centerX, y: centerY },
        data: {
          groupId,
          name,
          nodeIds: selectedNodes.map((n) => n.id),
          nodeCount: selectedNodes.length,
          nodeTypes: Array.from(
            new Set(
              selectedNodes.map((n) => n.data?.type as string).filter(Boolean)
            )
          ).slice(0, 4),
        },
      };
      const groups: Record<string, GroupState> = {
        ...state.groups,
        [groupId]: {
          id: groupId,
          name,
          nodeIds: selectedNodes.map((n) => n.id),
          collapsed: true,
          position: { x: centerX, y: centerY },
          storedNodes: selectedNodes.map((n) => ({ ...n, data: { ...n.data } })),
          storedEdges: storedEdges.map((e) => ({ ...e })),
        },
      };
      return {
        ...withHistoryPush(state),
        nodes: [...newNodes, groupNode],
        edges: markInvalidEdges([...newNodes, groupNode], newEdges),
        groups,
        selectedNodeId: null,
        isDirty: true,
      };
    }),

  toggleGroupCollapse: (groupId) =>
    set((state) => {
      const g = state.groups[groupId];
      if (!g) return state;
      if (g.collapsed) {
        if (!g.storedNodes || !g.storedEdges) return state;
        const nodeIds = new Set(g.nodeIds);
        const newNodes = state.nodes
          .filter((n) => n.id !== groupId)
          .concat(g.storedNodes)
          .map((n) => ({ ...n, selected: false }));
        const newEdges = state.edges
          .filter((e) => e.source !== groupId && e.target !== groupId)
          .concat(g.storedEdges);
        const groups = { ...state.groups };
        groups[groupId] = { ...g, collapsed: false };
        return {
          nodes: newNodes,
          edges: markInvalidEdges(newNodes, newEdges),
          groups,
          isDirty: true,
        };
      } else {
        const childNodes = state.nodes.filter((n) => g.nodeIds.includes(n.id));
        if (childNodes.length === 0) return state;
        const selectedIds = new Set(g.nodeIds);
        const internalEdges = state.edges.filter(
          (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
        );
        const externalEdges = state.edges.filter(
          (e) =>
            selectedIds.has(e.source) || selectedIds.has(e.target)
        );
        const storedEdges = externalEdges.concat(internalEdges);
        const newEdges = state.edges
          .filter((e) => e.source !== groupId && e.target !== groupId)
          .filter(
            (e) =>
              !(selectedIds.has(e.source) && selectedIds.has(e.target))
          );
        const outgoing = externalEdges.filter(
          (e) => selectedIds.has(e.source) && !selectedIds.has(e.target)
        );
        const incoming = externalEdges.filter(
          (e) => !selectedIds.has(e.source) && selectedIds.has(e.target)
        );
        for (const e of outgoing) {
          newEdges.push({
            ...e,
            id: `e${groupId}-${e.target}`,
            source: groupId,
            target: e.target,
          });
        }
        for (const e of incoming) {
          newEdges.push({
            ...e,
            id: `e${e.source}-${groupId}`,
            source: e.source,
            target: groupId,
          });
        }
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        const NODE_WIDTH = 180;
        const NODE_HEIGHT = 80;
        for (const n of childNodes) {
          const pos = n.position ?? { x: 0, y: 0 };
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
          maxX = Math.max(maxX, pos.x + NODE_WIDTH);
          maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
        }
        const centerX = (minX + maxX) / 2 - 100;
        const centerY = (minY + maxY) / 2 - 40;
        const groupNode: Node = {
          id: groupId,
          type: "group",
          position: { x: centerX, y: centerY },
          data: {
            groupId,
            name: g.name,
            nodeIds: g.nodeIds,
            nodeCount: g.nodeIds.length,
            nodeTypes: Array.from(
              new Set(
                childNodes.map((n) => n.data?.type as string).filter(Boolean)
              )
            ).slice(0, 4),
          },
        };
        const newNodes = state.nodes
          .filter((n) => !selectedIds.has(n.id))
          .concat([groupNode])
          .map((n) => ({ ...n, selected: false }));
        const groups = { ...state.groups };
        groups[groupId] = {
          ...g,
          collapsed: true,
          position: { x: centerX, y: centerY },
          storedNodes: childNodes.map((n) => ({ ...n, data: { ...n.data } })),
          storedEdges: storedEdges.map((e) => ({ ...e })),
        };
        return {
          nodes: newNodes,
          edges: markInvalidEdges(newNodes, newEdges),
          groups,
          isDirty: true,
        };
      }
    }),

  ungroupNodes: (groupId) =>
    set((state) => {
      const g = state.groups[groupId];
      if (!g) return state;
      const groups = { ...state.groups };
      delete groups[groupId];
      if (g.collapsed && g.storedNodes && g.storedEdges) {
        const newNodes = state.nodes
          .filter((n) => n.id !== groupId)
          .concat(g.storedNodes)
          .map((n) => ({ ...n, selected: false }));
        const newEdges = state.edges
          .filter((e) => e.source !== groupId && e.target !== groupId)
          .concat(g.storedEdges);
        return {
          ...withHistoryPush(state),
          nodes: newNodes,
          edges: markInvalidEdges(newNodes, newEdges),
          groups,
          isDirty: true,
        };
      }
      const selectedIds = new Set(g.nodeIds);
      const childNodes = state.nodes.filter((n) => selectedIds.has(n.id));
      const newNodes = state.nodes
        .filter((n) => n.id !== groupId && !selectedIds.has(n.id))
        .concat(childNodes)
        .map((n) => ({ ...n, selected: false }));
      const newEdges = state.edges.filter(
        (e) => e.source !== groupId && e.target !== groupId
      );
      return {
        ...withHistoryPush(state),
        nodes: newNodes,
        edges: markInvalidEdges(newNodes, newEdges),
        groups,
        isDirty: true,
      };
    }),

  renameGroup: (groupId, name) =>
    set((state) => {
      const g = state.groups[groupId];
      if (!g) return state;
      const groups = { ...state.groups };
      groups[groupId] = { ...g, name };
      const nodes = state.nodes.map((n) => {
        if (n.id === groupId && n.type === "group") {
          return { ...n, data: { ...n.data, name } };
        }
        return n;
      });
      return { groups, nodes, isDirty: true };
    }),

  pushHistory: () =>
    set((state) => {
      const entry = cloneState(state.nodes, state.edges);
      const undoStack = [...state.undoStack, entry].slice(-MAX_HISTORY);
      return { undoStack, redoStack: [] };
    }),

  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const entry = state.undoStack[state.undoStack.length - 1];
      const currentEntry = cloneState(state.nodes, state.edges);
      return {
        nodes: entry.nodes,
        edges: markInvalidEdges(entry.nodes, entry.edges),
        selectedNodeId: null,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, currentEntry],
        isDirty: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const entry = state.redoStack[state.redoStack.length - 1];
      const currentEntry = cloneState(state.nodes, state.edges);
      return {
        nodes: entry.nodes,
        edges: markInvalidEdges(entry.nodes, entry.edges),
        selectedNodeId: null,
        undoStack: [...state.undoStack, currentEntry],
        redoStack: state.redoStack.slice(0, -1),
        isDirty: true,
      };
    }),

  copySelectedNodes: () =>
    set((state) => {
      const selectedNodes = state.nodes.filter((n) => (n as Node & { selected?: boolean }).selected);
      if (selectedNodes.length === 0) return state;
      const selectedIds = new Set(selectedNodes.map((n) => n.id));
      const internalEdges = state.edges.filter(
        (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
      );
      return {
        clipboard: {
          nodes: selectedNodes.map((n) => ({ ...n, data: { ...n.data } })),
          edges: internalEdges.map((e) => ({ ...e })),
        },
      };
    }),

  pasteNodes: () =>
    set((state) => {
      const clip = state.clipboard;
      if (!clip || clip.nodes.length === 0) return state;
      const timestamp = Date.now().toString();
      const idMap = new Map<string, string>();
      const newNodes = clip.nodes.map((n) => {
        const newId = `${n.id}-copy-${timestamp}`;
        idMap.set(n.id, newId);
        const pos = n.position ?? { x: 0, y: 0 };
        return {
          ...n,
          id: newId,
          position: { x: pos.x + 50, y: pos.y + 50 },
          data: { ...n.data, hasError: false },
          selected: false,
        };
      });
      const newEdges = clip.edges
        .map((e, i) => {
          const src = idMap.get(e.source);
          const tgt = idMap.get(e.target);
          if (!src || !tgt) return null;
          return {
            ...e,
            id: `${e.id}-copy-${timestamp}-${i}`,
            source: src,
            target: tgt,
          };
        })
        .filter((e): e is Edge => e !== null);
      const allNodes = [...state.nodes, ...newNodes].map((n) => ({
        ...n,
        data: { ...n.data, hasError: hasNodeConfigError(n) },
      }));
      const allEdges = markInvalidEdges(allNodes, [...state.edges, ...newEdges]);
      return {
        ...withHistoryPush(state),
        nodes: allNodes,
        edges: allEdges,
        isDirty: true,
      };
    }),

  duplicateSelectedNodes: () => {
    const state = get();
    const selectedNodes = state.nodes.filter((n) => (n as Node & { selected?: boolean }).selected);
    if (selectedNodes.length === 0) return;
    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const internalEdges = state.edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );
    set({ clipboard: { nodes: [...selectedNodes], edges: [...internalEdges] } });
    get().pasteNodes();
  },

  selectAllNodes: () =>
    set((state) => {
      if (state.nodes.length === 0) return state;
      return {
        nodes: state.nodes.map((n) => ({ ...n, selected: true })),
        isDirty: true,
      };
    }),

  deleteSelected: () =>
    set((state) => {
      const selectedIds = new Set(
        state.nodes.filter((n) => (n as Node & { selected?: boolean }).selected).map((n) => n.id)
      );
      const groups = { ...state.groups };
      Array.from(selectedIds).forEach((id) => {
        if (id.startsWith("group-")) delete groups[id];
      });
      const selectedEdgeIds = new Set(
        state.edges
          .filter(
            (e) =>
              (e as Edge & { selected?: boolean }).selected ||
              selectedIds.has(e.source) ||
              selectedIds.has(e.target)
          )
          .map((e) => e.id)
      );
      if (selectedIds.size === 0 && selectedEdgeIds.size === 0) return state;
      const entry = cloneState(state.nodes, state.edges);
      const newNodes = state.nodes.filter((n) => !selectedIds.has(n.id));
      const newEdges = state.edges.filter((e) => !selectedEdgeIds.has(e.id));
      const clearedNodes = newNodes.map((n) => ({
        ...n,
        data: { ...n.data, hasError: hasNodeConfigError(n) },
      }));
      return {
        nodes: clearedNodes,
        edges: markInvalidEdges(clearedNodes, newEdges),
        groups,
        selectedNodeId: state.selectedNodeId && selectedIds.has(state.selectedNodeId) ? null : state.selectedNodeId,
        undoStack: [...state.undoStack, entry].slice(-MAX_HISTORY),
        redoStack: [],
        isDirty: true,
      };
    }),

  addNode: (node) =>
    set((state) => {
      const nodeClean = {
        ...node,
        data: { ...node.data, hasError: false },
      };
      return {
        ...withHistoryPush(state),
        nodes: [...state.nodes, nodeClean],
        isDirty: true,
      };
    }),

  loadPipeline: (nodes, edges, name, description) =>
    set({
      nodes: nodes.map((n) => ({
        ...n,
        data: { ...n.data, hasError: hasNodeConfigError(n) },
      })),
      edges: markInvalidEdges(nodes, edges),
      groups: {},
      pipelineName: name ?? "Untitled Pipeline",
      pipelineDescription: description ?? "",
      isDirty: true,
    }),

  resetPipeline: () =>
    set({
      nodes: [],
      edges: [],
      groups: {},
      selectedNodeId: null,
      pipelineName: "Untitled Pipeline",
      pipelineDescription: "",
      pipelineId: null,
      lastSavedAt: null,
      pipelineVersion: 1,
      isDirty: false,
      undoStack: [],
      redoStack: [],
      generatedSdpCode: "",
      generatedSssCode: "",
      sdpAnnotations: [],
      sssAnnotations: [],
      codeTarget: null,
    }),

  loadPipelineFromServer: async (id) => {
    try {
      const pipeline = await api.getPipeline(id);
    const nodes: Node[] = pipeline.nodes.map((n) => ({
      id: n.id,
      type: "custom" as const,
      position: n.position ?? { x: 0, y: 0 },
      data: {
        type: (n.type || "map-select") as NodeType,
        label: n.label ?? n.id,
        config: n.config ?? {},
        hasError: hasNodeConfigError({
          id: n.id,
          type: "custom",
          position: n.position ?? { x: 0, y: 0 },
          data: { type: n.type, label: n.label, config: n.config ?? {} },
        } as Node),
      },
    }));
    const edges: Edge[] = pipeline.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }));
    set({
      nodes: nodes.map((n) => ({
        ...n,
        data: { ...n.data, hasError: hasNodeConfigError(n) },
      })),
      edges: markInvalidEdges(nodes, edges),
      groups: {},
      pipelineName: pipeline.name,
      pipelineDescription: pipeline.description ?? "",
      pipelineId: pipeline.id,
      lastSavedAt: pipeline.updated_at,
      pipelineVersion: pipeline.version ?? 1,
      isDirty: false,
      selectedNodeId: null,
      undoStack: [],
      redoStack: [],
    });
    } catch (err) {
      useToastStore.getState().addToast(formatApiError(err), "error");
      throw err;
    }
  },

  syncFromCode: (inputNodes, inputEdges) => {
    const nodeIds = new Set(inputNodes.map((n) => n.id));
    const edges = inputEdges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target }));

    // Compute depth for each node (topological order)
    const depth = new Map<string, number>();
    const getDepth = (id: string): number => {
      if (depth.has(id)) return depth.get(id)!;
      const incoming = edges.filter((e) => e.target === id);
      const d = incoming.length === 0 ? 0 : 1 + Math.max(...incoming.map((e) => getDepth(e.source)));
      depth.set(id, d);
      return d;
    };
    inputNodes.forEach((n) => getDepth(n.id));

    // Group by depth, assign positions
    const byDepth = new Map<number, string[]>();
    inputNodes.forEach((n) => {
      const d = depth.get(n.id) ?? 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(n.id);
    });
    const SPACING_X = 250;
    const SPACING_Y = 80;

    const nodes: Node[] = inputNodes.map((input) => {
      const d = depth.get(input.id) ?? 0;
      const row = byDepth.get(d)!.indexOf(input.id);
      const x = d * SPACING_X;
      const y = row * SPACING_Y;
      return {
        id: input.id,
        type: "custom" as const,
        position: { x, y },
        data: {
          type: (input.type || "map-select") as NodeType,
          label: input.label ?? input.id,
          config: input.config ?? {},
          hasError: false,
        },
      };
    });

    get().loadPipeline(nodes, edges);
  },

  removeNode: (id) =>
    set((state) => {
      const groups = { ...state.groups };
      if (id.startsWith("group-")) delete groups[id];
      return {
        ...withHistoryPush(state),
        nodes: state.nodes.filter((n) => n.id !== id),
        edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        groups,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        isDirty: true,
      };
    }),

  removeNodes: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const newNodes = state.nodes.filter((n) => !idSet.has(n.id));
      const newEdges = state.edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target)
      );
      return {
        ...withHistoryPush(state),
        nodes: newNodes,
        edges: markInvalidEdges(newNodes, newEdges),
        selectedNodeId:
          state.selectedNodeId && idSet.has(state.selectedNodeId)
            ? null
            : state.selectedNodeId,
        isDirty: true,
      };
    }),

  updateNode: (id, data) =>
    set((state) => {
      const updatedNodes = state.nodes.map((n) => {
        if (n.id !== id) return n;
        const merged = { ...n.data, ...data };
        const hasError = hasNodeConfigError({ ...n, data: merged });
        return { ...n, data: { ...merged, hasError } };
      });
      return { nodes: updatedNodes, isDirty: true };
    }),

  batchUpdateNodes: (updates) =>
    set((state) => {
      if (updates.length === 0) return state;
      const updateMap = new Map(updates.map((u) => [u.nodeId, u.data]));
      const updatedNodes = state.nodes.map((n) => {
        const data = updateMap.get(n.id);
        if (!data) return n;
        const merged = { ...n.data, ...data };
        const hasError = hasNodeConfigError({ ...n, data: merged });
        return { ...n, data: { ...merged, hasError } };
      });
      return { nodes: updatedNodes, isDirty: true };
    }),

  setNodes: (nodes) =>
    set((state) => ({
      nodes,
      edges: markInvalidEdges(nodes, state.edges),
      isDirty: true,
    })),

  toggleNodePreview: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const expanded = !(n.data?.previewExpanded === true);
        return { ...n, data: { ...n.data, previewExpanded: expanded } };
      }),
    })),

  setNodePreviewData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            previewData: { columns: data.columns, rows: data.rows },
          },
        };
      }),
    })),

  applySearchHighlights: (matchedIds) =>
    set((state) => {
      let changed = false;
      const newNodes = state.nodes.map((n) => {
        const shouldHighlight = matchedIds.has(n.id);
        if (Boolean(n.data?.searchHighlight) === shouldHighlight) return n;
        changed = true;
        return { ...n, data: { ...n.data, searchHighlight: shouldHighlight } };
      });
      return changed ? { nodes: newNodes } : {};
    }),

  onNodesChange: (nodes) =>
    set((state) => {
      let groups = state.groups;
      for (const n of nodes) {
        if (n.type === "group" && n.id.startsWith("group-") && state.groups[n.id]) {
          const pos = n.position ?? { x: 0, y: 0 };
          groups = { ...groups, [n.id]: { ...state.groups[n.id], position: pos } };
        }
      }
      return { nodes, groups, isDirty: true };
    }),

  onEdgesChange: (edges) =>
    set((state) => {
      const marked = markInvalidEdges(state.nodes, edges);
      const edgeIds = (e: Edge) => e.id;
      const prevIds = new Set(state.edges.map(edgeIds));
      const nextIds = new Set(marked.map(edgeIds));
      const edgesChanged =
        prevIds.size !== nextIds.size ||
        marked.some((e) => !prevIds.has(e.id)) ||
        state.edges.some((e) => !nextIds.has(e.id));
      return {
        ...(edgesChanged ? withHistoryPush(state) : {}),
        edges: marked,
        isDirty: true,
      };
    }),

  onConnect: (connection) =>
    set((state) => ({
      ...withHistoryPush(state),
      edges: [
        ...state.edges,
        {
          id: `e${connection.source}-${connection.target}`,
          source: connection.source!,
          target: connection.target!,
        },
      ],
      isDirty: true,
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  deselectNode: () => set({ selectedNodeId: null }),

  panToNodeId: null,

  requestPanToNode: (id) =>
    set({ panToNodeId: id, selectedNodeId: id }),

  clearPanToNode: () => set({ panToNodeId: null }),

  setPipelineName: (name) => set({ pipelineName: name, isDirty: true }),

  setPipelineDescription: (desc) => set({ pipelineDescription: desc, isDirty: true }),

  setGeneratedCode: (sdp, sss, sdpAnn, sssAnn) =>
    set({
      generatedSdpCode: sdp,
      generatedSssCode: sss,
      sdpAnnotations: sdpAnn ?? [],
      sssAnnotations: sssAnn ?? [],
    }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  triggerCodeGen: debounce(() => {
    get().generateCode();
  }, 300),

  validatePipeline: () => {
    const { getExpandedNodesAndEdges } = get();
    const { nodes, edges } = getExpandedNodesAndEdges();
    const errors: string[] = [];
    const warnings: string[] = [];

    const sourceNodes = nodes.filter(
      (n) => (NODE_REGISTRY[n.data?.type as keyof typeof NODE_REGISTRY]?.category ?? "") === "source"
    );
    const sinkNodes = nodes.filter(
      (n) => (NODE_REGISTRY[n.data?.type as keyof typeof NODE_REGISTRY]?.category ?? "") === "sink"
    );

    if (sourceNodes.length === 0) {
      errors.push("At least one source node is required");
    }
    if (sinkNodes.length === 0) {
      errors.push("At least one sink node is required");
    }

    const connectedNodeIds = new Set<string>();
    for (const e of edges) {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    }
    const orphanNodes = nodes.filter((n) => !connectedNodeIds.has(n.id));
    if (orphanNodes.length > 0) {
      errors.push(`${orphanNodes.length} orphan node(s) - all nodes must be connected`);
    }

    const invalidEdges = edges.filter((e) => e.data?.isInvalid === true);
    if (invalidEdges.length > 0) {
      errors.push(`${invalidEdges.length} invalid connection(s) - check edge semantics`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  generateCode: async () => {
    const { pipelineName, pipelineDescription, getExpandedNodesAndEdges } = get();
    const { nodes, edges } = getExpandedNodesAndEdges();
    if (nodes.length === 0) return;

    set({ isGenerating: true, warnings: [] });
    try {
      const result = await api.generateCode({
        name: pipelineName,
        description: pipelineDescription,
        nodes,
        edges,
      });
      set({
        generatedSdpCode: result.sdp_code ?? "",
        generatedSssCode: result.sss_code ?? "",
        sdpAnnotations: result.sdp_annotations ?? [],
        sssAnnotations: result.sss_annotations ?? [],
        codeTarget: result.code_target ?? null,
        warnings: result.warnings ?? [],
        isGenerating: false,
      });
    } catch (err) {
      set({ isGenerating: false, warnings: ["Code generation failed"] });
      useToastStore.getState().addToast(formatApiError(err), "error");
    }
  },

  savePipeline: async () => {
    const { pipelineName, pipelineDescription, pipelineId, getExpandedNodesAndEdges } =
      get();
    const { nodes, edges } = getExpandedNodesAndEdges();
    set({ isSaving: true });
    try {
      const result = await api.savePipeline({
        id: pipelineId ?? undefined,
        name: pipelineName,
        description: pipelineDescription,
        nodes,
        edges,
      });
      // Refetch to get updated_at and version for display
      const full = await api.getPipeline(result.id);
      set({
        pipelineId: result.id,
        lastSavedAt: full.updated_at,
        pipelineVersion: full.version ?? 1,
        isDirty: false,
        isSaving: false,
      });
    } catch (err) {
      set({ isSaving: false });
      useToastStore.getState().addToast(formatApiError(err), "error");
      throw err;
    }
  },

  deployPipeline: async (request) => {
    set({ isDeploying: true });
    try {
      const result = await api.deployPipeline(request);
      set({ isDeploying: false });
      return result;
    } catch (err) {
      set({ isDeploying: false });
      useToastStore.getState().addToast(formatApiError(err), "error");
      throw err;
    }
  },
}));
