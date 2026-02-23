import { create } from "zustand";
import type { Node, Edge, Connection } from "@xyflow/react";
import * as api from "@/lib/api";
import { markInvalidEdges } from "@/lib/edgeValidator";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { hasNodeConfigError } from "@/lib/configValidator";
import { useToastStore } from "@/hooks/useToastStore";

type CodeTarget = "sdp" | "sss" | "hybrid" | null;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

let codeGenTimeout: ReturnType<typeof setTimeout> | undefined;

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
  codeTarget: CodeTarget;
  warnings: string[];
  isGenerating: boolean;
  isSaving: boolean;
  isDeploying: boolean;

  addNode: (node: Node) => void;
  loadPipeline: (nodes: Node[], edges: Edge[], name?: string, description?: string) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, data: Partial<Node["data"]>) => void;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  deselectNode: () => void;
  setPipelineName: (name: string) => void;
  setPipelineDescription: (desc: string) => void;
  setGeneratedCode: (sdp: string, sss: string) => void;
  setDirty: (dirty: boolean) => void;
  triggerCodeGen: () => void;
  generateCode: () => Promise<void>;
  validatePipeline: () => ValidationResult;
  savePipeline: () => Promise<void>;
  deployPipeline: (request: {
    pipeline_id: string;
    job_name: string;
    cluster_config?: Record<string, unknown>;
  }) => Promise<{ job_id: string; job_url: string; status: string }>;
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
  codeTarget: null,
  warnings: [],
  isGenerating: false,
  isSaving: false,
  isDeploying: false,

  addNode: (node) =>
    set((state) => {
      const hasError = hasNodeConfigError(node);
      const nodeWithError = {
        ...node,
        data: { ...node.data, hasError },
      };
      return { nodes: [...state.nodes, nodeWithError], isDirty: true };
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

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      isDirty: true,
    })),

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
      return { edges: marked, isDirty: true };
    }),

  onConnect: (connection) =>
    set((state) => ({
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
      set({
        pipelineId: result.id,
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
