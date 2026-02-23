"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { validatePipeline } from "@/lib/pipelineValidator";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import type { ValidationIssue } from "@/lib/pipelineValidator";

interface ValidationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function getNodeLabel(nodes: { id: string; data?: { label?: string } }[], nodeId: string): string {
  const n = nodes.find((x) => x.id === nodeId);
  return n ? String(n.data?.label ?? n.id) : nodeId;
}

export default function ValidationPanel({ isOpen, onClose }: ValidationPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const requestPanToNode = usePipelineStore((s) => s.requestPanToNode);

  const issues = useMemo(
    () => validatePipeline(nodes, edges, NODE_REGISTRY),
    [nodes, edges, refreshKey]
  );

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  useEffect(() => {
    if (isOpen) {
      setRefreshKey((k) => k + 1);
    }
  }, [isOpen]);

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
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-xl transition-transform duration-200"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-200">
            Pipeline Validation
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 p-3">
            {errors.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-sm font-medium text-red-400">
                {errors.length} error{errors.length !== 1 ? "s" : ""}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-sm font-medium text-amber-400">
                {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
              </span>
            )}
            {infos.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-1 text-sm font-medium text-blue-400">
                {infos.length} info
              </span>
            )}
            {issues.length === 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-sm font-medium text-emerald-400">
                All clear
              </span>
            )}
          </div>

          <div
            className="flex-1 overflow-y-auto p-4"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            {issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
                <p className="text-base font-medium text-slate-200">
                  Pipeline is valid and ready to deploy
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  No errors, warnings, or suggestions
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {errors.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-400">
                      <AlertCircle className="h-4 w-4" />
                      Errors
                    </h3>
                    <ul className="space-y-2">
                      {errors.map((issue, idx) => (
                        <IssueItem
                          key={`err-${idx}`}
                          issue={issue}
                          nodes={nodes}
                          onNodeClick={requestPanToNode}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {warnings.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Warnings
                    </h3>
                    <ul className="space-y-2">
                      {warnings.map((issue, idx) => (
                        <IssueItem
                          key={`warn-${idx}`}
                          issue={issue}
                          nodes={nodes}
                          onNodeClick={requestPanToNode}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {infos.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-400">
                      <Info className="h-4 w-4" />
                      Info
                    </h3>
                    <ul className="space-y-2">
                      {infos.map((issue, idx) => (
                        <IssueItem
                          key={`info-${idx}`}
                          issue={issue}
                          nodes={nodes}
                          onNodeClick={requestPanToNode}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function IssueItem({
  issue,
  nodes,
  onNodeClick,
}: {
  issue: ValidationIssue;
  nodes: { id: string; data?: { label?: string } }[];
  onNodeClick: (nodeId: string) => void;
}) {
  const Icon =
    issue.severity === "error"
      ? AlertCircle
      : issue.severity === "warning"
        ? AlertTriangle
        : Info;
  const iconColor =
    issue.severity === "error"
      ? "text-red-400"
      : issue.severity === "warning"
        ? "text-amber-400"
        : "text-blue-400";

  const nodeLabel = issue.nodeId ? getNodeLabel(nodes, issue.nodeId) : null;

  return (
    <li className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="flex gap-3">
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-200">{issue.message}</p>
          {nodeLabel && (
            <button
              onClick={() => issue.nodeId && onNodeClick(issue.nodeId)}
              className="mt-1 text-xs font-medium text-slate-400 hover:text-blue-400 hover:underline"
            >
              {nodeLabel}
            </button>
          )}
          {issue.fixSuggestion && (
            <p className="mt-1.5 text-xs text-slate-500">
              {issue.fixSuggestion}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
