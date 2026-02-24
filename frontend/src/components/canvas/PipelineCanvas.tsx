"use client";

import { useCallback, useEffect, useRef } from "react";
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
import GroupNode from "@/components/canvas/GroupNode";
import CustomEdge from "@/components/canvas/CustomEdge";
import PipelineSearch from "@/components/canvas/PipelineSearch";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { throttle } from "@/lib/performanceUtils";
import { validateConnection } from "@/lib/edgeValidator";
import { useToastStore } from "@/hooks/useToastStore";

const nodeTypes: NodeTypes = {
  custom: CustomNode,
  group: GroupNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

const SNAP_GRID: [number, number] = [15, 15];

function PanToNodeEffect() {
  const { setCenter, getNodes } = useReactFlow();
  const panToNodeId = usePipelineStore((s) => s.panToNodeId);
  const clearPanToNode = usePipelineStore((s) => s.clearPanToNode);

  useEffect(() => {
    if (!panToNodeId) return;
    const node = getNodes().find((n) => n.id === panToNodeId);
    if (node) {
      const cx = node.position.x + 90;
      const cy = node.position.y + 40;
      setCenter(cx, cy, { duration: 300 });
    }
    clearPanToNode();
  }, [panToNodeId, getNodes, setCenter, clearPanToNode]);

  return null;
}

function isPositionOnlyChange(changes: NodeChange[]): boolean {
  return changes.length > 0 && changes.every((c) => (c as { type?: string }).type === "position");
}

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

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const throttledPositionUpdate = useRef(
    throttle((nextNodes: Node[]) => {
      storeOnNodesChange(nextNodes);
    }, 50)
  ).current;

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodesRef.current);
      if (isPositionOnlyChange(changes)) {
        throttledPositionUpdate(nextNodes);
      } else {
        storeOnNodesChange(nextNodes);
        triggerCodeGen();
      }
    },
    [storeOnNodesChange, triggerCodeGen, throttledPositionUpdate]
  );

  const handleNodeDragStop = useCallback(() => {
    triggerCodeGen();
  }, [triggerCodeGen]);

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      storeOnEdgesChange(nextEdges);
      triggerCodeGen();
    },
    [edges, storeOnEdgesChange, triggerCodeGen]
  );

  const addToast = useToastStore((s) => s.addToast);

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) {
        addToast("Could not find source or target node", "error");
        return;
      }
      const result = validateConnection(sourceNode, targetNode, edges);
      if (!result.valid) {
        addToast(result.reason ?? "Invalid connection", "error");
        return;
      }
      const nextEdges = addEdge(
        { ...connection, type: "custom" },
        edges.map((e) => ({ ...e, type: "custom" }))
      );
      storeOnEdgesChange(nextEdges);
      triggerCodeGen();
    },
    [nodes, edges, storeOnEdgesChange, triggerCodeGen, addToast]
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
    <div className="relative h-full w-full">
      <PanToNodeEffect />
      <PipelineSearch />
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
        onNodeDragStop={handleNodeDragStop}
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
          className="!border-[#30363d] !bg-[#21262d] !shadow-lg"
        />
        <MiniMap
          position="bottom-right"
          className="!rounded-lg !border-[#30363d] !bg-[#161b22] !shadow-lg"
          maskColor="rgba(15, 23, 42, 0.8)"
          nodeColor={(node) => {
            const def = NODE_REGISTRY[node.data?.type as keyof typeof NODE_REGISTRY];
            if (!def) return "#64748b";
            const cat = def.category ?? "transform";
            const CATEGORY_COLORS: Record<string, string> = {
              source: "#22c55e",
              "cep-pattern": "#8b5cf6",
              pattern: "#8b5cf6",
              transform: "#3b82f6",
              sink: "#f97316",
            };
            return CATEGORY_COLORS[cat] ?? "#64748b";
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
