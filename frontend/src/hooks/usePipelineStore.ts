import { create } from "zustand";
import type { Node, Edge, Connection } from "@xyflow/react";
import * as api from "@/lib/api";
import { markInvalidEdges } from "@/lib/edgeValidator";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { hasNodeConfigError } from "@/lib/configValidator";
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

interface PipelineState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  generatedSdpCode: string;
  generatedSssCode: string;
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

  addNode: (node: Node) => void;
  loadPipeline: (nodes: Node[], edges: Edge[], name?: string, description?: string) => void;
  resetPipeline: () => void;
  loadPipelineFromServer: (id: string) => Promise<void>;
  syncFromCode: (nodes: PipelineNodeInput[], edges: PipelineEdgeInput[]) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  updateNode: (id: string, data: Partial<Node["data"]>) => void;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  deselectNode: () => void;
  deleteSelected: () => void;
  setPipelineName: (name: string) => void;
  setPipelineDescription: (desc: string) => void;
  setGeneratedCode: (sdp: string, sss: string) => void;
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
    code_target?: "sdp" | "sss";
    schedule?: string;
    max_retries?: number;
    checkpoint_location?: string;
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

  deleteSelected: () =>
    set((state) => {
      const selectedIds = new Set(
        state.nodes.filter((n) => (n as Node & { selected?: boolean }).selected).map((n) => n.id)
      );
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
      pipelineName: name ?? "Untitled Pipeline",
      pipelineDescription: description ?? "",
      isDirty: true,
    }),

  resetPipeline: () =>
    set({
      nodes: [],
      edges: [],
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
      codeTarget: null,
    }),

  loadPipelineFromServer: async (id) => {
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
    set((state) => ({
      ...withHistoryPush(state),
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      isDirty: true,
    })),

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

  onNodesChange: (nodes) => set({ nodes, isDirty: true }),

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

  setPipelineName: (name) => set({ pipelineName: name, isDirty: true }),

  setPipelineDescription: (desc) => set({ pipelineDescription: desc, isDirty: true }),

  setGeneratedCode: (sdp, sss) =>
    set({ generatedSdpCode: sdp, generatedSssCode: sss }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  triggerCodeGen: () => {
    get().generateCode();
  },

  validatePipeline: () => {
    const { nodes, edges } = get();
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
    const { nodes, edges, pipelineName, pipelineDescription } = get();
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
        codeTarget: result.code_target ?? null,
        warnings: result.warnings ?? [],
        isGenerating: false,
      });
    } catch {
      set({ isGenerating: false, warnings: ["Code generation failed"] });
      useToastStore.getState().addToast("Code generation failed", "error");
    }
  },

  savePipeline: async () => {
    const { nodes, edges, pipelineName, pipelineDescription, pipelineId } =
      get();
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
    } catch {
      set({ isSaving: false });
    }
  },

  deployPipeline: async (request) => {
    set({ isDeploying: true });
    try {
      const result = await api.deployPipeline(request);
      set({ isDeploying: false });
      return result;
    } catch {
      set({ isDeploying: false });
      throw new Error("Deployment failed");
    }
  },
}));
