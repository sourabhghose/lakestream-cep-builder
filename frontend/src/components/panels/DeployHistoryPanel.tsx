"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { useToastStore } from "@/hooks/useToastStore";

interface DeployHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string | null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const statusLower = status.toLowerCase();
  const isSuccess = statusLower === "success" || statusLower === "created" || statusLower === "updated";
  const isFailed = statusLower === "failed";
  const isPending = statusLower === "pending";

  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-xs font-medium",
        isSuccess && "bg-green-500/20 text-green-400",
        isFailed && "bg-red-500/20 text-red-400",
        isPending && "bg-amber-500/20 text-amber-400",
        !isSuccess && !isFailed && !isPending && "bg-[#484f58]/20 text-[#8b949e]"
      )}
    >
      {status}
    </span>
  );
}

function CodeTargetBadge({ target }: { target: string }) {
  const upper = target.toUpperCase();
  return (
    <span className="rounded bg-[#30363d]/50 px-2 py-0.5 text-xs font-medium text-[#c9d1d9]">
      {upper}
    </span>
  );
}

export default function DeployHistoryPanel({
  isOpen,
  onClose,
  pipelineId,
}: DeployHistoryPanelProps) {
  const [deploys, setDeploys] = useState<api.DeployHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (isOpen && pipelineId) {
      setLoading(true);
      api
        .getDeployHistory(pipelineId)
        .then(setDeploys)
        .catch(() => addToast("Failed to load deploy history", "error"))
        .finally(() => setLoading(false));
    } else if (isOpen && !pipelineId) {
      setDeploys([]);
    }
  }, [isOpen, pipelineId, addToast]);

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
          <h2 className="text-lg font-semibold text-[#e8eaed]">Deploy History</h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            {!pipelineId ? (
              <div className="py-12 text-center text-sm text-[#484f58]">
                Save a pipeline first to see deploy history
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#484f58]" />
              </div>
            ) : deploys.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#484f58]">
                No deployments yet
              </div>
            ) : (
              <ul className="space-y-2">
                {deploys.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-lg border border-[#30363d] bg-[#21262d80] overflow-hidden"
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CodeTargetBadge target={d.code_target} />
                            <StatusBadge status={d.deploy_status} />
                          </div>
                          <p className="mt-1 text-sm font-medium text-[#e8eaed]">
                            v{d.pipeline_version}
                          </p>
                          <p className="mt-0.5 text-xs text-[#484f58]">
                            {formatDate(d.deployed_at)}
                          </p>
                          {d.deployed_by && (
                            <p className="mt-0.5 text-xs text-[#484f58]">
                              by {d.deployed_by}
                            </p>
                          )}
                          {d.error_message && (
                            <p className="mt-1 text-xs text-red-400">
                              {d.error_message}
                            </p>
                          )}
                          {d.deploy_status.toLowerCase() !== "failed" &&
                            d.job_url && (
                              <a
                                href={d.job_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-[#58a6ff] hover:text-blue-300"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open job
                              </a>
                            )}
                        </div>
                        {d.deployed_code && (
                          <button
                            onClick={() =>
                              setExpandedId((prev) =>
                                prev === d.id ? null : d.id
                              )
                            }
                            className="flex shrink-0 items-center gap-1 rounded p-2 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
                            title="View Code"
                          >
                            {expandedId === d.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="text-xs">View Code</span>
                          </button>
                        )}
                      </div>
                      {expandedId === d.id && d.deployed_code && (
                        <div className="mt-3 rounded border border-[#30363d] bg-[#0d1117] p-3">
                          <pre className="max-h-64 overflow-auto text-xs text-[#c9d1d9] whitespace-pre-wrap font-mono">
                            {d.deployed_code}
                          </pre>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {pipelineId && deploys.length > 0 && (
            <div className="border-t border-[#30363d] px-4 py-3 text-sm text-[#484f58]">
              Total: {deploys.length} deployment{deploys.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
