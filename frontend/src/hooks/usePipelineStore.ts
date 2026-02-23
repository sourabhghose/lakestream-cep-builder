import { create } from "zustand";
import type { Node, Edge, Connection } from "@xyflow/react";
import * as api from "@/lib/api";

type CodeTarget = "sdp" | "sss" | "hybrid" | null;

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
    set((state) => ({
      nodes: [...state.nodes, node],
      isDirty: true,
    })),

  loadPipeline: (nodes, edges, name, description) =>
    set({
      nodes,
      edges,
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
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    })),

  onNodesChange: (nodes) => set({ nodes, isDirty: true }),

  onEdgesChange: (edges) => set({ edges, isDirty: true }),

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
