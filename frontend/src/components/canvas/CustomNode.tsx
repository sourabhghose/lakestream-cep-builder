"use client";

import { memo, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { getNodeIcon } from "@/lib/iconRegistry";
import { Eye, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { getNodePreview } from "@/lib/api";
import type { PreviewSampleResponse } from "@/lib/api";
import DataPreview from "@/components/preview/DataPreview";
import InlinePreview from "@/components/canvas/InlinePreview";

const PREVIEW_REFRESH_MS = 5000;

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  source: "border-node-source",
  "cep-pattern": "border-node-pattern",
  pattern: "border-node-pattern",
  transform: "border-node-transform",
  sink: "border-node-sink",
};

function CustomNodeInner({ id: nodeId, data, selected }: NodeProps) {
  const { nodes, edges, toggleNodePreview, setNodePreviewData } = usePipelineStore();
  const [showPreview, setShowPreview] = useState(false);
  const [inlinePreviewLoading, setInlinePreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewSampleResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const panelRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelFetchingRef = useRef(false);

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (showPreview) {
        setShowPreview(false);
        return;
      }
      setPreviewLoading(true);
      setShowPreview(true);
      panelFetchingRef.current = true;
      const seed = Math.floor(Date.now() / PREVIEW_REFRESH_MS);
      getNodePreview({ nodes, edges }, nodeId, seed)
        .then((res) => setPreviewData(res))
        .catch(() => setPreviewData({ columns: [], rows: [], row_count: 0 }))
        .finally(() => { setPreviewLoading(false); panelFetchingRef.current = false; });
    },
    [showPreview, nodes, edges, nodeId]
  );

  // Auto-refresh the Preview Data modal panel while it's open
  useEffect(() => {
    if (showPreview) {
      panelRefreshTimerRef.current = setInterval(() => {
        if (panelFetchingRef.current) return;
        panelFetchingRef.current = true;
        const seed = Math.floor(Date.now() / PREVIEW_REFRESH_MS);
        getNodePreview({ nodes: nodesRef.current, edges: edgesRef.current }, nodeId, seed)
          .then((res) => setPreviewData(res))
          .catch(() => {})
          .finally(() => { panelFetchingRef.current = false; });
      }, PREVIEW_REFRESH_MS);
    }
    return () => {
      if (panelRefreshTimerRef.current) {
        clearInterval(panelRefreshTimerRef.current);
        panelRefreshTimerRef.current = null;
      }
    };
  }, [showPreview, nodeId]);

  const previewExpanded = data.previewExpanded === true;
  const inlinePreviewData = data.previewData as { columns: string[]; rows: (string | number | boolean | null)[][] } | undefined;
  const [dataFlash, setDataFlash] = useState(false);
  const autoExpandedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inlineFetchingRef = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const fetchPreview = useCallback(() => {
    if (inlineFetchingRef.current) return;
    inlineFetchingRef.current = true;
    const seed = Math.floor(Date.now() / PREVIEW_REFRESH_MS);
    getNodePreview({ nodes: nodesRef.current, edges: edgesRef.current }, nodeId, seed)
      .then((res) => {
        setNodePreviewData(nodeId, { columns: res.columns, rows: res.rows });
        setDataFlash(true);
        setTimeout(() => setDataFlash(false), 400);
      })
      .catch(() => {})
      .finally(() => { inlineFetchingRef.current = false; });
  }, [nodeId, setNodePreviewData]);

  // Auto-expand preview when a node is first placed on the canvas
  useEffect(() => {
    if (!autoExpandedRef.current && !previewExpanded) {
      autoExpandedRef.current = true;
      toggleNodePreview(nodeId);
      setInlinePreviewLoading(true);
      const seed = Math.floor(Date.now() / PREVIEW_REFRESH_MS);
      getNodePreview({ nodes, edges }, nodeId, seed)
        .then((res) =>
          setNodePreviewData(nodeId, { columns: res.columns, rows: res.rows })
        )
        .catch(() => setNodePreviewData(nodeId, { columns: [], rows: [] }))
        .finally(() => setInlinePreviewLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh preview data while expanded
  useEffect(() => {
    if (previewExpanded) {
      refreshTimerRef.current = setInterval(fetchPreview, PREVIEW_REFRESH_MS);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [previewExpanded, fetchPreview]);

  const handleInlineExpandClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const willExpand = !previewExpanded;
      toggleNodePreview(nodeId);
      if (willExpand && !inlinePreviewData) {
        setInlinePreviewLoading(true);
        const seed = Math.floor(Date.now() / PREVIEW_REFRESH_MS);
        getNodePreview({ nodes, edges }, nodeId, seed)
          .then((res) =>
            setNodePreviewData(nodeId, { columns: res.columns, rows: res.rows })
          )
          .catch(() => setNodePreviewData(nodeId, { columns: [], rows: [] }))
          .finally(() => setInlinePreviewLoading(false));
      }
    },
    [previewExpanded, inlinePreviewData, toggleNodePreview, setNodePreviewData, nodes, edges, nodeId]
  );

  const def = useMemo(
    () =>
      NODE_REGISTRY[data.type as keyof typeof NODE_REGISTRY] ?? {
        label: data.label ?? "Unknown",
        description: "",
        category: "transform",
        codeTarget: "sdp-or-sss",
      },
    [data.type, data.label]
  );

  const category = def.category ?? "transform";
  const borderColor = CATEGORY_BORDER_COLORS[category] ?? "border-node-transform";
  const hasError = data.hasError === true;
  const searchHighlight = data.searchHighlight === true;
  const inputs = def.inputs ?? 1;
  const outputs = def.outputs ?? 1;

  const IconComponent = useMemo(
    () => getNodeIcon(def.icon),
    [def.icon]
  );

  const badges = useMemo(() => {
    const b: string[] = [];
    if (def.codeTarget === "sdp" || def.codeTarget === "sdp-or-sss") b.push("SDP");
    if (def.codeTarget === "sss" || def.codeTarget === "sdp-or-sss") b.push("SSS");
    return b;
  }, [def.codeTarget]);

  const categoryLabelMap: Record<string, string> = {
    source: "source",
    sink: "sink",
    pattern: "pattern",
    "cep-pattern": "pattern",
    transform: "transform",
  };
  const categoryLabel = categoryLabelMap[category] ?? "transform";
  const ariaLabel = `${data.label ?? def.label ?? "Unknown"} ${categoryLabel} node${hasError ? ", has error" : ""}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={cn(
        "min-w-[180px] rounded-lg border-2 bg-[#1e2329] px-4 py-3 shadow-lg backdrop-blur text-[#e8eaed]",
        "[will-change:transform]",
        borderColor,
        selected && "ring-2 ring-[#58a6ff] ring-offset-2 ring-offset-[#1b1f23] outline-none",
        hasError && "border-red-500",
        searchHighlight && "ring-2 ring-[#58a6ff] animate-pulse",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1f23]"
      )}
    >
      {Array.from({ length: Math.max(1, inputs) }).map((_, i) => (
        <Handle
          key={`target-${i}`}
          type="target"
          position={Position.Left}
          id={inputs > 1 ? `target-${i}` : undefined}
          className="!bg-[#484f58]"
          style={inputs > 1 ? { top: `${((i + 1) / (inputs + 1)) * 100}%` } : undefined}
        />
      ))}
      {Array.from({ length: Math.max(1, outputs) }).map((_, i) => (
        <Handle
          key={`source-${i}`}
          type="source"
          position={Position.Right}
          id={outputs > 1 ? `source-${i}` : undefined}
          className="!bg-[#484f58]"
          style={outputs > 1 ? { top: `${((i + 1) / (outputs + 1)) * 100}%` } : undefined}
        />
      ))}

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#30363d]">
          <IconComponent className="h-4 w-4 text-[#c9d1d9]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-[#e8eaed]">
              {String(data.label ?? def.label ?? "Unknown")}
            </span>
            <button
              type="button"
              onClick={handlePreviewClick}
              className="shrink-0 rounded p-1 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
              title="Preview data"
              aria-label="Preview node data"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            {hasError && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                Error
              </span>
            )}
          </div>
          {data.configSummary != null && data.configSummary !== "" && (
            <p className="mt-0.5 truncate text-xs text-[#8b949e]">
              {String(data.configSummary)}
            </p>
          )}
          {badges.length > 0 && (
            <div className="mt-2 flex gap-1">
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded bg-[#30363d] px-1.5 py-0.5 text-[10px] text-[#c9d1d9]"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-center border-t border-[#30363d] pt-2">
        <button
          type="button"
          onClick={handleInlineExpandClick}
          className="flex items-center gap-1 rounded px-2 py-1 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
          title={previewExpanded ? "Collapse preview" : "Expand preview"}
          aria-label={previewExpanded ? "Collapse inline preview" : "Expand inline preview"}
        >
          {previewExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span className="text-[10px] font-medium">
            {previewExpanded ? "Collapse" : "Preview"}
          </span>
        </button>
      </div>

      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: previewExpanded ? 120 : 0 }}
      >
        <div className="mt-2 pt-2">
          {inlinePreviewLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-[#8b949e]" />
            </div>
          ) : inlinePreviewData && (inlinePreviewData.columns.length > 0 || inlinePreviewData.rows.length > 0) ? (
            <div className={cn("transition-opacity duration-300", dataFlash && "opacity-70")}>
              <InlinePreview
                columns={inlinePreviewData.columns}
                rows={inlinePreviewData.rows}
              />
            </div>
          ) : previewExpanded && !inlinePreviewLoading ? (
            <p className="py-2 text-center text-[10px] text-[#484f58]">
              No preview data
            </p>
          ) : null}
        </div>
      </div>

      {showPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPreview(false);
            }}
          >
            <div
              className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-2">
                <h3 className="font-medium text-[#e8eaed]">Data Preview</h3>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="rounded p-1.5 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
                  aria-label="Close data preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4">
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[#8b949e]" />
                  </div>
                ) : previewData ? (
                  <DataPreview
                    columns={previewData.columns}
                    rows={previewData.rows}
                    rowCount={previewData.row_count}
                    source={previewData.source}
                  />
                ) : (
                  <p className="py-4 text-center text-sm text-[#484f58]">No preview data</p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function propsAreEqual(
  prev: NodeProps,
  next: NodeProps
): boolean {
  if (prev.id !== next.id || prev.selected !== next.selected) return false;
  // Skip re-render when only position changed (smoother canvas panning/drag)
  const pd = prev.data;
  const nd = next.data;
  const dataEqual =
    pd?.type === nd?.type &&
    pd?.label === nd?.label &&
    pd?.hasError === nd?.hasError &&
    pd?.configSummary === nd?.configSummary &&
    pd?.searchHighlight === nd?.searchHighlight &&
    pd?.previewExpanded === nd?.previewExpanded &&
    pd?.previewData === nd?.previewData;
  return dataEqual;
}

export default memo(CustomNodeInner, propsAreEqual);
