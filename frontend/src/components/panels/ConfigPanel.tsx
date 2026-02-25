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
import { useResizableReverse } from "@/hooks/useResizable";
import type { NodeType } from "@/types/nodes";

interface ConfigPanelProps {
  isOpen: boolean;
  className?: string;
}

export default function ConfigPanel({ isOpen, className }: ConfigPanelProps) {
  const { size: panelWidth, onMouseDown: onResizeStart } = useResizableReverse({
    direction: "horizontal",
    initialSize: 350,
    minSize: 280,
    maxSize: 600,
    storageKey: "lakestream-config-width",
  });
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
    return null;
  }

  if (!definition) {
    return (
      <div
        className={cn(
          "relative flex flex-col border-l border-[#30363d] bg-[#161b22]",
          className
        )}
        style={{ width: panelWidth }}
      >
        <div
          className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[#1f6feb] active:bg-[#1f6feb] transition-colors"
          onMouseDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize config panel"
          title="Drag to resize"
        />
        <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
          <h3 className="font-medium text-[#e8eaed]">Node Config</h3>
          <button
            onClick={deselectNode}
            className="rounded p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
            title="Close"
            aria-label="Close configuration panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-[#6e7681]">Unknown node type</p>
        </div>
      </div>
    );
  }

  const IconComponent = getNodeIcon(definition.icon);

  return (
    <div
      className={cn(
        "relative flex flex-col border-l border-[#30363d] bg-[#161b22]",
        className
      )}
      style={{ width: panelWidth }}
    >
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[#1f6feb] active:bg-[#1f6feb] transition-colors"
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize config panel"
        title="Drag to resize"
      />
      <div className="flex items-center justify-between gap-3 border-b border-[#30363d] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#30363d]">
            <IconComponent className="h-4 w-4 text-[#c9d1d9]" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-medium text-[#e8eaed]">{definition.label}</h3>
            <p className="truncate text-xs text-[#6e7681]">{definition.description}</p>
          </div>
        </div>
        <button
          onClick={deselectNode}
          className="shrink-0 rounded p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
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
      <div className="border-t border-[#30363d] px-4 py-3">
        <h4 className="mb-2 text-sm font-medium text-[#c9d1d9]">Preview Data</h4>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d]"
          aria-label="Preview data for selected node"
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
            <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
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
      <div className="flex gap-2 border-t border-[#30363d] px-4 py-3">
        <button
          className="flex-1 rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#388bfd]"
          aria-label="Apply configuration"
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
          className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d]"
          aria-label="Reset configuration to last saved"
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
