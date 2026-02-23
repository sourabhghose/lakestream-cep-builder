"use client";

import { useEffect, useState, useMemo } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { useToastStore } from "@/hooks/useToastStore";
import { usePipelineStore } from "@/hooks/usePipelineStore";

interface VersionDiffPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Normalize node to { id, config } for diffing. Handles both backend (config) and frontend (data.config) formats. */
function getNodeConfig(node: { id: string; config?: unknown; data?: { config?: unknown } }): unknown {
  return node.config ?? node.data?.config ?? {};
}

function getNodes(version: { canvas_json?: { nodes?: unknown[] } }): { id: string; config: unknown }[] {
  const nodes = version?.canvas_json?.nodes ?? [];
  return (nodes as { id: string; config?: unknown; data?: { config?: unknown } }[]).map((n) => ({
    id: n.id,
    config: getNodeConfig(n),
  }));
}

function getEdges(version: { canvas_json?: { edges?: unknown[] } }): { id: string; source: string; target: string }[] {
  const edges = version?.canvas_json?.edges ?? [];
  return (edges as { id: string; source: string; target: string }[]).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));
}

function getNodeLabel(node: { id: string; label?: string; data?: { label?: string } }): string {
  return (node.label ?? node.data?.label ?? node.id) as string;
}

interface RawNode { id: string; config?: unknown; data?: { config?: unknown; label?: string }; label?: string }

function diffPipelines(
  versionA: { canvas_json?: { nodes?: unknown[]; edges?: unknown[] } },
  versionB: { canvas_json?: { nodes?: unknown[]; edges?: unknown[] } }
) {
  const nodesA = (versionA?.canvas_json?.nodes ?? []) as RawNode[];
  const nodesB = (versionB?.canvas_json?.nodes ?? []) as RawNode[];
  const nodesANorm = getNodes(versionA);
  const nodesBNorm = getNodes(versionB);
  const nodeIdsA = new Set(nodesANorm.map((n) => n.id));
  const nodeIdsB = new Set(nodesBNorm.map((n) => n.id));

  const added = nodesB.filter((n) => !nodeIdsA.has(n.id));
  const removed = nodesA.filter((n) => !nodeIdsB.has(n.id));
  const modified = nodesA.filter((n) => {
    const bNode = nodesBNorm.find((bn) => bn.id === n.id);
    if (!bNode) return false;
    const aConfig = getNodeConfig(n);
    return JSON.stringify(aConfig) !== JSON.stringify(bNode.config);
  });

  const edgesA = getEdges(versionA);
  const edgesB = getEdges(versionB);
  const edgeIdsA = new Set(edgesA.map((e) => e.id));
  const edgeIdsB = new Set(edgesB.map((e) => e.id));
  const edgesAdded = edgesB.filter((e) => !edgeIdsA.has(e.id));
  const edgesRemoved = edgesA.filter((e) => !edgeIdsB.has(e.id));

  return {
    added,
    removed,
    modified,
    edgesAdded,
    edgesRemoved,
    edgesChanged: edgesAdded.length + edgesRemoved.length,
  };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function VersionDiffPanel({ isOpen, onClose }: VersionDiffPanelProps) {
  const [versions, setVersions] = useState<api.PipelineVersionSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [versionA, setVersionA] = useState<string>("current");
  const [versionB, setVersionB] = useState<string>("prev");
  const addToast = useToastStore((s) => s.addToast);
  const {
    pipelineId,
    nodes,
    edges,
    pipelineVersion,
    lastSavedAt,
    pipelineName,
    selectNode,
  } = usePipelineStore();

  const currentVersion = useMemo(
    () => ({
      version: pipelineVersion,
      saved_at: lastSavedAt ?? new Date().toISOString(),
      canvas_json: { nodes, edges },
      name: pipelineName,
    }),
    [pipelineVersion, lastSavedAt, nodes, edges, pipelineName]
  );

  useEffect(() => {
    if (isOpen && pipelineId) {
      setLoading(true);
      api
        .getPipelineVersions(pipelineId)
        .then(setVersions)
        .catch(() => addToast("Failed to load version history", "error"))
        .finally(() => setLoading(false));
    } else if (isOpen && !pipelineId) {
      setVersions([]);
    }
  }, [isOpen, pipelineId, addToast]);

  const allVersions = useMemo(() => {
    const hist = versions.map((v) => ({ ...v, key: `v${v.version}` }));
    const curr = { ...currentVersion, key: "current" };
    return [curr, ...hist].sort((a, b) => a.version - b.version).reverse();
  }, [versions, currentVersion]);

  const versionAObj = versionA === "current" ? currentVersion : versions.find((v) => `v${v.version}` === versionA);
  const versionBObj = versionB === "prev"
    ? (allVersions.length > 1 ? allVersions[1] : allVersions[0])
    : versionB === "current"
      ? currentVersion
      : versions.find((v) => `v${v.version}` === versionB);

  const diff = useMemo(() => {
    if (!versionAObj || !versionBObj) return null;
    return diffPipelines(versionAObj, versionBObj);
  }, [versionAObj, versionBObj]);

  const currentNodeIds = new Set(nodes.map((n) => n.id));

  const handleSelectNode = (nodeId: string) => {
    if (currentNodeIds.has(nodeId)) {
      selectNode(nodeId);
    }
  };

  const handleVersionAChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setVersionA(e.target.value);
  };

  const handleVersionBChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setVersionB(e.target.value);
  };

  const handleClose = () => {
    setVersionA("current");
    setVersionB("prev");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-xl transition-transform duration-200"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-200">Version History</h2>
          <button
            onClick={handleClose}
            className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {!pipelineId ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Save a pipeline first to compare versions
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-slate-500">Version A</label>
                    <select
                      value={versionA}
                      onChange={handleVersionAChange}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="current">Current (v{pipelineVersion})</option>
                      {versions.map((v) => (
                        <option key={v.version} value={`v${v.version}`}>
                          v{v.version} · {formatDate(v.saved_at)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-slate-500">Version B</label>
                    <select
                      value={versionB}
                      onChange={handleVersionBChange}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="prev">Previous</option>
                      <option value="current">Current (v{pipelineVersion})</option>
                      {versions.map((v) => (
                        <option key={v.version} value={`v${v.version}`}>
                          v{v.version} · {formatDate(v.saved_at)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {diff && (
                  <>
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
                      {diff.added.length} node{diff.added.length !== 1 ? "s" : ""} added,{" "}
                      {diff.removed.length} removed, {diff.modified.length} modified,{" "}
                      {diff.edgesChanged} edge{diff.edgesChanged !== 1 ? "s" : ""} changed
                    </div>

                    <div className="space-y-3">
                      {diff.added.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Added nodes</h3>
                          <ul className="space-y-1">
                            {diff.added.map((n: { id: string; label?: string; data?: { label?: string } }) => (
                              <li key={n.id}>
                                <button
                                  onClick={() => handleSelectNode(n.id)}
                                  className={cn(
                                    "inline-flex items-center rounded px-2 py-0.5 text-xs",
                                    currentNodeIds.has(n.id)
                                      ? "cursor-pointer bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                      : "cursor-default bg-green-500/20 text-green-400"
                                  )}
                                >
                                  {getNodeLabel(n)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diff.removed.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Removed nodes</h3>
                          <ul className="space-y-1">
                            {diff.removed.map((n: { id: string; label?: string; data?: { label?: string } }) => (
                              <li key={n.id}>
                                <button
                                  onClick={() => handleSelectNode(n.id)}
                                  className={cn(
                                    "inline-flex items-center rounded px-2 py-0.5 text-xs",
                                    currentNodeIds.has(n.id)
                                      ? "cursor-pointer bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                      : "cursor-default bg-red-500/20 text-red-400"
                                  )}
                                >
                                  {getNodeLabel(n)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diff.modified.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Modified nodes</h3>
                          <ul className="space-y-1">
                            {diff.modified.map((n: { id: string; label?: string; data?: { label?: string } }) => (
                              <li key={n.id}>
                                <button
                                  onClick={() => handleSelectNode(n.id)}
                                  className={cn(
                                    "inline-flex items-center rounded px-2 py-0.5 text-xs",
                                    currentNodeIds.has(n.id)
                                      ? "cursor-pointer bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                      : "cursor-default bg-amber-500/20 text-amber-400"
                                  )}
                                >
                                  {getNodeLabel(n)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diff.edgesChanged > 0 && (
                        <div>
                          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Edge changes</h3>
                          <p className="text-xs text-slate-400">
                            {diff.edgesAdded.length} added, {diff.edgesRemoved.length} removed
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {versions.length === 0 && pipelineId && !loading && (
                  <p className="py-4 text-center text-sm text-slate-500">
                    No version history yet. Save the pipeline to create versions.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
