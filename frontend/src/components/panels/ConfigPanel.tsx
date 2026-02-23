"use client";

import { useRef, useEffect, useState } from "react";
import { Settings2, X, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { getNodeIcon } from "@/lib/iconRegistry";
import DynamicConfigForm from "@/components/panels/DynamicConfigForm";
import DataPreview from "@/components/preview/DataPreview";
import { getNodePreview } from "@/lib/api";
import type { NodeType } from "@/types/nodes";

interface ConfigPanelProps {
  isOpen: boolean;
  className?: string;
}

export default function ConfigPanel({ isOpen, className }: ConfigPanelProps) {
  const {
    selectedNodeId,
    nodes,
    edges,
    deselectNode,
    updateNode,
    triggerCodeGen,
  } = usePipelineStore();
  const [previewData, setPreviewData] = useState<{
    columns: string[];
    rows: (string | number | boolean | null)[][];
    row_count: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const lastSavedConfigRef = useRef<Record<string, unknown>>({});

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  useEffect(() => {
    if (selectedNode?.data?.config) {
      lastSavedConfigRef.current = { ...selectedNode.data.config };
    } else {
      lastSavedConfigRef.current = {};
    }
  }, [selectedNodeId]);
  const nodeType = selectedNode?.data?.type as NodeType | undefined;
  const definition = nodeType ? NODE_REGISTRY[nodeType] : undefined;

  if (!isOpen || !selectedNode) {
    return (
      <div
        className={cn(
          "flex w-12 flex-col border-l border-slate-700 bg-slate-900/95",
          className
        )}
      >
        <div className="flex h-12 items-center justify-center border-b border-slate-700 text-slate-500">
          <Settings2 className="h-5 w-5" />
        </div>
        <div className="flex flex-1 items-center justify-center p-2">
          <p className="text-center text-xs text-slate-500">
            Select a node to configure
          </p>
        </div>
      </div>
    );
  }

  if (!definition) {
    return (
      <div
        className={cn(
          "flex w-[350px] flex-col border-l border-slate-700 bg-slate-900/95",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h3 className="font-medium text-slate-200">Node Config</h3>
          <button
            onClick={deselectNode}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-slate-500">Unknown node type</p>
        </div>
      </div>
    );
  }

  const IconComponent = getNodeIcon(definition.icon);

  return (
    <div
      className={cn(
        "flex w-[350px] flex-col border-l border-slate-700 bg-slate-900/95",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-800">
            <IconComponent className="h-4 w-4 text-slate-300" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-medium text-slate-200">{definition.label}</h3>
            <p className="truncate text-xs text-slate-500">{definition.description}</p>
          </div>
        </div>
        <button
          onClick={deselectNode}
          className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <DynamicConfigForm
          definition={definition}
          config={(selectedNode.data?.config ?? {}) as Record<string, unknown>}
          onChange={(newConfig) => {
            if (selectedNodeId) {
              updateNode(selectedNodeId, { config: newConfig });
            }
          }}
        />
      </div>
      <div className="border-t border-slate-700 px-4 py-3">
        <h4 className="mb-2 text-sm font-medium text-slate-300">Preview Data</h4>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
          onClick={() => {
            if (selectedNodeId) {
              setPreviewLoading(true);
              setPreviewData(null);
              getNodePreview({ nodes, edges }, selectedNodeId)
                .then(setPreviewData)
                .catch(() => setPreviewData({ columns: [], rows: [], row_count: 0 }))
                .finally(() => setPreviewLoading(false));
            }
          }}
        >
          <Eye className="h-4 w-4" />
            Preview Data
        </button>
        {previewLoading && (
          <div className="mt-3 flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}
        {!previewLoading && previewData && (
          <div className="mt-3">
            <DataPreview
              columns={previewData.columns}
              rows={previewData.rows}
              rowCount={previewData.row_count}
            />
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-slate-700 px-4 py-3">
        <button
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => {
            if (selectedNodeId && selectedNode) {
              lastSavedConfigRef.current =
                { ...(selectedNode.data?.config ?? {}) };
              triggerCodeGen();
            }
          }}
        >
          Apply
        </button>
        <button
          className="rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
          onClick={() => {
            if (selectedNodeId) {
              updateNode(selectedNodeId, {
                config: lastSavedConfigRef.current,
              });
            }
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
