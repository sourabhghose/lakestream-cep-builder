"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  Loader2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { validatePipeline } from "@/lib/pipelineValidator";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { aiSmartValidate } from "@/lib/api";
import type { ValidationIssue } from "@/lib/pipelineValidator";
import type { SmartValidateSuggestion } from "@/lib/api";

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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<SmartValidateSuggestion[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const groups = usePipelineStore((s) => s.groups);
  const pipelineName = usePipelineStore((s) => s.pipelineName);
  const getExpandedNodesAndEdges = usePipelineStore((s) => s.getExpandedNodesAndEdges);
  const requestPanToNode = usePipelineStore((s) => s.requestPanToNode);

  const { nodes: expandedNodes, edges: expandedEdges } = useMemo(
    () => getExpandedNodesAndEdges(),
    [nodes, edges, groups, getExpandedNodesAndEdges, refreshKey]
  );

  const issues = useMemo(
    () => validatePipeline(expandedNodes, expandedEdges, NODE_REGISTRY),
    [expandedNodes, expandedEdges]
  );

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  useEffect(() => {
    if (isOpen) {
      setRefreshKey((k) => k + 1);
    }
  }, [isOpen]);

  const handleAiReview = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiScore(null);
    setAiSuggestions([]);
    try {
      const result = await aiSmartValidate({ nodes: expandedNodes, edges: expandedEdges }, pipelineName);
      setAiSummary(result.summary);
      setAiScore(result.score);
      setAiSuggestions(result.suggestions);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "userMessage" in err
          ? String((err as { userMessage?: string }).userMessage)
          : err instanceof Error ? err.message : "AI review failed";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

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
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[#30363d] bg-[#161b22] shadow-xl transition-transform duration-200"
        )}
      >
        <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
          <h2 className="text-lg font-semibold text-[#e8eaed]">
            Pipeline Validation
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleAiReview}
              disabled={aiLoading || expandedNodes.length === 0}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
                aiLoading
                  ? "bg-purple-600/30 text-purple-300 cursor-wait"
                  : "bg-gradient-to-r from-purple-600/80 to-blue-600/80 text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              )}
              title="AI-powered pipeline review"
              aria-label="AI Smart Review"
            >
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              AI Review
            </button>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#30363d] p-3">
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#58a6ff]/20 px-2.5 py-1 text-sm font-medium text-[#58a6ff]">
                {infos.length} info
              </span>
            )}
            {issues.length === 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-sm font-medium text-emerald-400">
                All clear
              </span>
            )}
          </div>

          {/* AI Smart Review Results */}
          {(aiSummary || aiLoading || aiError) && (
            <div className="border-b border-[#30363d] p-3 space-y-3">
              {aiLoading && (
                <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                  Running AI review...
                </div>
              )}
              {aiError && <p className="text-sm text-red-400">{aiError}</p>}
              {aiSummary && !aiLoading && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-xs font-semibold text-purple-300">AI Review</span>
                    </div>
                    {aiScore !== null && (
                      <div className="ml-auto flex items-center gap-1">
                        <Star className={cn("h-3.5 w-3.5", aiScore >= 7 ? "text-emerald-400" : aiScore >= 4 ? "text-amber-400" : "text-red-400")} />
                        <span className={cn("text-sm font-bold", aiScore >= 7 ? "text-emerald-400" : aiScore >= 4 ? "text-amber-400" : "text-red-400")}>
                          {aiScore}/10
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-[#c9d1d9]">{aiSummary}</p>
                  {aiSuggestions.length > 0 && (
                    <ul className="space-y-2">
                      {aiSuggestions.map((s, i) => (
                        <li key={i} className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            {s.severity === "error" ? <AlertCircle className="h-3.5 w-3.5 text-red-400" /> :
                             s.severity === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> :
                             <Info className="h-3.5 w-3.5 text-[#58a6ff]" />}
                            <span className="text-xs font-medium text-[#e8eaed]">{s.title}</span>
                            <span className="ml-auto rounded-full bg-[#30363d] px-2 py-0.5 text-[10px] text-[#8b949e]">
                              {s.category.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-xs text-[#8b949e] leading-relaxed">{s.description}</p>
                          {s.node_id && (
                            <button
                              onClick={() => requestPanToNode(s.node_id!)}
                              className="mt-1 text-[10px] text-[#58a6ff] hover:underline"
                            >
                              Go to node
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto p-4"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            {issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
                <p className="text-base font-medium text-[#e8eaed]">
                  Pipeline is valid and ready to deploy
                </p>
                <p className="mt-1 text-sm text-[#484f58]">
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
                          nodes={expandedNodes}
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
                          nodes={expandedNodes}
                          onNodeClick={requestPanToNode}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {infos.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#58a6ff]">
                      <Info className="h-4 w-4" />
                      Info
                    </h3>
                    <ul className="space-y-2">
                      {infos.map((issue, idx) => (
                        <IssueItem
                          key={`info-${idx}`}
                          issue={issue}
                          nodes={expandedNodes}
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
        : "text-[#58a6ff]";

  const nodeLabel = issue.nodeId ? getNodeLabel(nodes, issue.nodeId) : null;

  return (
    <li className="rounded-lg border border-[#30363d] bg-[#21262d80] p-3">
      <div className="flex gap-3">
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#e8eaed]">{issue.message}</p>
          {nodeLabel && (
            <button
              onClick={() => issue.nodeId && onNodeClick(issue.nodeId)}
              className="mt-1 text-xs font-medium text-[#8b949e] hover:text-[#58a6ff] hover:underline"
            >
              {nodeLabel}
            </button>
          )}
          {issue.fixSuggestion && (
            <p className="mt-1.5 text-xs text-[#484f58]">
              {issue.fixSuggestion}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
