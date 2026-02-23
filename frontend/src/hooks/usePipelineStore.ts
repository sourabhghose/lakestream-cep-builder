import { create } from "zustand";
import type { Node, Edge, Connection } from "@xyflow/react";

interface PipelineState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  generatedSdpCode: string;
  generatedSssCode: string;
  pipelineName: string;
  isDirty: boolean;

  addNode: (node: Node) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, data: Partial<Node["data"]>) => void;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  deselectNode: () => void;
  setPipelineName: (name: string) => void;
  setGeneratedCode: (sdp: string, sss: string) => void;
  setDirty: (dirty: boolean) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  generatedSdpCode: "",
  generatedSssCode: "",
  pipelineName: "Untitled Pipeline",
  isDirty: false,

  addNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, node],
      isDirty: true,
    })),

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

  onNodesChange: (nodes) =>
    set({ nodes, isDirty: true }),

  onEdgesChange: (edges) =>
    set({ edges, isDirty: true }),

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

  setGeneratedCode: (sdp, sss) =>
    set({ generatedSdpCode: sdp, generatedSssCode: sss }),

  setDirty: (dirty) => set({ isDirty: dirty }),
}));
