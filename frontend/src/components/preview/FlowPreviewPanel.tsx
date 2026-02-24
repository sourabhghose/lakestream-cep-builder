"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, RefreshCw, Loader2, ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { getFlowPreview } from "@/lib/api";
import { getNodeIcon } from "@/lib/iconRegistry";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import InlinePreview from "@/components/canvas/InlinePreview";

export interface FlowPreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function getNodeLabel(
  nodes: { id: string; data?: { type?: string; label?: string } }[],
  nodeId: string
): string {
  const n = nodes.find((x) => x.id === nodeId);
  if (n?.data?.label) return String(n.data.label);
  const def = n?.data?.type ? NODE_REGISTRY[n.data.type as keyof typeof NODE_REGISTRY] : undefined;
  return def?.label ?? nodeId;
}

export default function FlowPreviewPanel({ isOpen, onClose }: FlowPreviewPanelProps) {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const groups = usePipelineStore((s) => s.groups);
  const getExpandedNodesAndEdges = usePipelineStore((s) => s.getExpandedNodesAndEdges);
  const { nodes: expandedNodes, edges: expandedEdges } = useMemo(
    () => getExpandedNodesAndEdges(),
    [getExpandedNodesAndEdges, nodes, edges, groups]
  );
  const nodesToUse = expandedNodes;
  const edgesToUse = expandedEdges;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<
    Record<string, { columns: string[]; rows: (string | number | boolean | null)[][] }>
  >({});

  const fetchPreview = useCallback(async () => {
    if (nodesToUse.length === 0) {
      setPreviews({});
      setError("Add nodes to the pipeline to see flow preview");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getFlowPreview({ nodes: nodesToUse, edges: edgesToUse });
      setPreviews(res.node_previews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load flow preview");
      setPreviews({});
    } finally {
      setLoading(false);
    }
  }, [nodesToUse, edgesToUse]);

  useEffect(() => {
    if (isOpen) fetchPreview();
  }, [isOpen, fetchPreview]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-[#30363d] bg-[#161b22] shadow-xl transition-transform duration-200"
        )}
      >
        <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
          <h2 className="text-lg font-semibold text-[#e8eaed]">Flow Preview</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchPreview}
              disabled={loading || nodesToUse.length === 0}
              className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed] disabled:opacity-50"
              title="Refresh"
              aria-label="Refresh"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
              title="Close"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && Object.keys(previews).length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#8b949e]">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm">Computing flow preview…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-amber-400">
              <AlertCircle className="h-10 w-10" />
              <p className="text-sm text-center">{error}</p>
              <button
                onClick={fetchPreview}
                className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-sm text-[#c9d1d9] hover:bg-[#30363d]"
              >
                Retry
              </button>
            </div>
          ) : Object.keys(previews).length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#484f58]">
              <p className="text-sm">No pipeline or empty pipeline.</p>
              <p className="text-xs">Add nodes and edges, then click Refresh.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Object.entries(previews).map(([nodeId, data], idx) => {
                const node = nodesToUse.find((n) => n.id === nodeId);
                const nodeType = (node?.data?.type ?? "map-select") as keyof typeof NODE_REGISTRY;
                const def = NODE_REGISTRY[nodeType];
                const IconComponent = getNodeIcon(def?.icon);
                const label = getNodeLabel(nodesToUse, nodeId);

                return (
                  <div key={nodeId} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#21262d]/60 px-3 py-2">
                      <IconComponent className="h-4 w-4 shrink-0 text-[#8b949e]" />
                      <span className="truncate text-sm font-medium text-[#e8eaed]">
                        {label}
                      </span>
                    </div>
                    <div className="pl-2">
                      <InlinePreview
                        columns={data.columns}
                        rows={data.rows}
                        className="max-h-[100px]"
                      />
                    </div>
                    {idx < Object.keys(previews).length - 1 && (
                      <div className="flex justify-center py-1">
                        <ChevronDown className="h-5 w-5 text-[#484f58]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
