"use client";

import { useEffect, useState } from "react";
import { X, Plus, Loader2, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";

interface PipelineListPanelProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function PipelineListPanel({ isOpen, onClose }: PipelineListPanelProps) {
  const [pipelines, setPipelines] = useState<api.PipelineSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const resetPipeline = usePipelineStore((s) => s.resetPipeline);
  const loadPipelineFromServer = usePipelineStore((s) => s.loadPipelineFromServer);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api
        .listPipelines()
        .then(setPipelines)
        .catch(() => addToast("Failed to load pipelines", "error"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, addToast]);

  const handleNew = () => {
    resetPipeline();
    onClose();
    addToast("New pipeline created", "success");
  };

  const handleLoad = async (id: string) => {
    try {
      await loadPipelineFromServer(id);
      onClose();
      addToast("Pipeline loaded", "success");
    } catch {
      addToast("Failed to load pipeline", "error");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deletePipeline(id);
      setPipelines((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
      addToast("Pipeline deleted", "success");
    } catch {
      addToast("Failed to delete pipeline", "error");
    } finally {
      setDeletingId(null);
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
          <h2 className="text-lg font-semibold text-[#e8eaed]">Pipelines</h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-[#30363d] p-3">
            <button
              onClick={handleNew}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1f6feb] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#388bfd]"
            >
              <Plus className="h-4 w-4" />
              New Pipeline
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#484f58]" />
              </div>
            ) : pipelines.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#484f58]">
                No saved pipelines yet
              </div>
            ) : (
              <ul className="space-y-2">
                {pipelines.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-[#30363d] bg-[#21262d80] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[#e8eaed]">
                          {p.name || "Untitled"}
                        </p>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[#484f58]">
                            {p.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-[#484f58]">
                          {p.node_count} nodes · {formatDate(p.updated_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleLoad(p.id)}
                          className="rounded p-2 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
                          title="Load"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
                        {confirmDeleteId === p.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deletingId === p.id}
                              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingId === p.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Confirm"
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded px-2 py-1 text-xs text-[#8b949e] hover:text-[#e8eaed]"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="rounded p-2 text-[#8b949e] hover:bg-[#30363d] hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
