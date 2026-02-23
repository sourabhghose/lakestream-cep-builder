"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Node,
  type Connection,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type EdgeTypes,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CustomNode from "@/components/canvas/CustomNode";
import CustomEdge from "@/components/canvas/CustomEdge";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

const SNAP_GRID: [number, number] = [15, 15];

function PipelineCanvasInner() {
  const { screenToFlowPosition } = useReactFlow();
  const {
    nodes,
    edges,
    onNodesChange: storeOnNodesChange,
    onEdgesChange: storeOnEdgesChange,
    addNode: storeAddNode,
    selectNode,
    deselectNode,
    triggerCodeGen,
  } = usePipelineStore();

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      storeOnNodesChange(nextNodes);
      triggerCodeGen();
    },
    [nodes, storeOnNodesChange, triggerCodeGen]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      storeOnEdgesChange(nextEdges);
      triggerCodeGen();
    },
    [edges, storeOnEdgesChange, triggerCodeGen]
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = addEdge(connection, edges);
      storeOnEdgesChange(nextEdges);
      triggerCodeGen();
    },
    [edges, storeOnEdgesChange, triggerCodeGen]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/reactflow");
      if (!nodeType) return;

      const def = NODE_REGISTRY[nodeType as keyof typeof NODE_REGISTRY];
      if (!def) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${nodeType}-${Date.now()}`,
        type: "custom",
        position,
        data: {
          type: nodeType,
          label: def.label,
          config: {},
          codeTarget: def.codeTarget,
          configSummary: "",
        },
      };

      storeAddNode(newNode);
      triggerCodeGen();
    },
    [screenToFlowPosition, storeAddNode, triggerCodeGen]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handlePaneClick = useCallback(() => {
    deselectNode();
  }, [deselectNode]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid
        snapGrid={SNAP_GRID}
        fitView
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: "custom" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={15}
          size={1}
          color="rgba(148, 163, 184, 0.2)"
        />
        <Controls
          showInteractive={false}
          className="!border-slate-700 !bg-slate-800 !shadow-lg"
        />
        <MiniMap
          className="!rounded-lg !border-slate-700 !bg-slate-900"
            nodeColor={(node) => {
            const def = NODE_REGISTRY[node.data?.type as keyof typeof NODE_REGISTRY];
            if (!def) return "#64748b";
            return def.color ?? "#64748b";
          }}
        />
      </ReactFlow>
    </div>
  );
}

export default function PipelineCanvas() {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner />
    </ReactFlowProvider>
  );
}
