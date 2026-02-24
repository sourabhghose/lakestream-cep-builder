"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { X, Play, Loader2, Upload, FileJson, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { testPattern, type PatternTestResponse, type PatternTestMatch } from "@/lib/api";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";

const CEP_PATTERN_TYPES = new Set([
  "sequence-detector", "absence-detector", "count-threshold", "velocity-detector",
  "geofence-location", "temporal-correlation", "trend-detector", "outlier-anomaly",
  "session-detector", "deduplication", "match-recognize-sql", "custom-stateful-processor",
]);

const SOURCE_TYPES = new Set([
  "kafka-topic", "delta-table-source", "auto-loader", "rest-webhook-source",
  "cdc-stream", "event-hub-kinesis", "mqtt", "custom-python-source",
]);

export interface PatternTestPanelProps {
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

function generateSampleEvents(
  nodes: { id: string; data?: { type?: string; config?: Record<string, unknown> } }[],
  count: number = 8
): Record<string, unknown>[] {
  const sources = nodes.filter((n) => n.data?.type && SOURCE_TYPES.has(n.data.type as string));
  const base = new Date("2024-01-01T00:00:00Z").getTime();
  const eventTypes = ["login", "purchase", "view", "click", "logout"];
  const events: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const ts = new Date(base + i * 1000).toISOString();
    const ev: Record<string, unknown> = {
      timestamp: ts,
      event_type: eventTypes[i % eventTypes.length],
      user_id: `u${(i % 3) + 1}`,
      amount: 100 + i * 50,
    };
    events.push(ev);
  }
  return events;
}

export default function PatternTestPanel({ isOpen, onClose }: PatternTestPanelProps) {
  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const groups = usePipelineStore((s) => s.groups);
  const getExpandedNodesAndEdges = usePipelineStore((s) => s.getExpandedNodesAndEdges);
  const selectNode = usePipelineStore((s) => s.selectNode);

  const { nodes: expandedNodes, edges: expandedEdges } = useMemo(
    () => getExpandedNodesAndEdges(),
    [getExpandedNodesAndEdges, nodes, edges, groups]
  );

  const [eventsJson, setEventsJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PatternTestResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const eventCount = useCallback(() => {
    if (!eventsJson.trim()) return 0;
    try {
      const parsed = JSON.parse(eventsJson);
      const arr = Array.isArray(parsed) ? parsed : parsed.events ?? [];
      return arr.length;
    } catch {
      return 0;
    }
  }, [eventsJson]);

  const handleGenerateSample = () => {
    const events = generateSampleEvents(expandedNodes, 8);
    setEventsJson(JSON.stringify(events, null, 2));
    setError(null);
    setResult(null);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.events ?? parsed;
        setEventsJson(JSON.stringify(arr, null, 2));
        setError(null);
        setResult(null);
      } catch {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  const handleRunTest = async () => {
    let events: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(eventsJson || "[]");
      events = Array.isArray(parsed) ? parsed : parsed.events ?? [];
    } catch {
      setError("Invalid JSON in events");
      return;
    }
    if (events.length === 0) {
      setError("No events to test. Paste JSON or generate sample events.");
      return;
    }
    if (expandedNodes.length === 0) {
      setError("Add nodes to the pipeline first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await testPattern(
        { nodes: expandedNodes, edges: expandedEdges },
        events
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pattern test failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMatchClick = (match: PatternTestMatch) => {
    selectNode(match.pattern_node_id);
  };

  if (!isOpen) return null;

  const count = eventCount();
  const hasPatternNodes = expandedNodes.some(
    (n) => n.data?.type && CEP_PATTERN_TYPES.has(n.data.type as string)
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-[#30363d] bg-[#161b22] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
          <h2 className="text-lg font-semibold text-[#e8eaed]">Pattern Test</h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            title="Close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {/* Input section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-[#c9d1d9]">Sample Events</label>
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded border border-[#30363d] bg-[#21262d] px-2.5 py-1.5 text-xs text-[#c9d1d9] hover:bg-[#30363d]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload JSON
                </button>
                <button
                  onClick={handleGenerateSample}
                  className="flex items-center gap-1.5 rounded border border-[#30363d] bg-[#21262d] px-2.5 py-1.5 text-xs text-[#c9d1d9] hover:bg-[#30363d]"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  Generate Sample
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleUploadFile}
            />
            <textarea
              value={eventsJson}
              onChange={(e) => {
                setEventsJson(e.target.value);
                setError(null);
              }}
              placeholder='[{"timestamp": "2024-01-01T00:00:01", "event_type": "login", "user_id": "u1"}, ...]'
              className="h-32 w-full resize-y rounded border border-[#30363d] bg-[#21262d] px-3 py-2 font-mono text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-purple-500 focus:outline-none"
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#484f58]">
                {count} event{count !== 1 ? "s" : ""}
              </span>
              <button
                onClick={handleRunTest}
                disabled={loading || count === 0 || !hasPatternNodes}
                className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run Test
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-600/50 bg-amber-600/10 px-3 py-2 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium",
                    result.total_matches > 0
                      ? "bg-green-600/20 text-green-400"
                      : "bg-[#30363d] text-[#8b949e]"
                  )}
                >
                  {result.total_matches} match{result.total_matches !== 1 ? "es" : ""}
                </span>
                <span className="text-sm text-[#484f58]">
                  {result.total_events} events tested
                </span>
              </div>

              {result.matches.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-[#c9d1d9]">Matches</h3>
                  <ul className="space-y-2">
                    {result.matches.map((match, idx) => (
                      <li
                        key={idx}
                        onClick={() => handleMatchClick(match)}
                        className="cursor-pointer rounded-lg border border-[#30363d] bg-[#21262d]/60 px-3 py-2 transition hover:border-purple-500/50 hover:bg-[#21262d]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[#e8eaed]">
                            {match.pattern_name}
                          </span>
                          <span className="text-xs text-[#484f58]">
                            {match.pattern_node_id}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[#8b949e]">
                          Events: [{match.matched_events.join(", ")}]
                          {match.match_time && ` · ${match.match_time}`}
                        </div>
                        <div className="mt-1 text-xs text-[#484f58]">
                          {match.details}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-medium text-[#c9d1d9]">Event Flow</h3>
                <div className="space-y-1.5">
                  {result.event_flow.map((ef) => (
                    <div
                      key={ef.event_index}
                      className="flex items-center gap-3 rounded border border-[#30363d] bg-[#21262d]/40 px-2 py-1.5 text-xs"
                    >
                      <span className="w-8 shrink-0 font-mono text-[#484f58]">
                        E{ef.event_index}
                      </span>
                      <span className="flex flex-wrap gap-1 text-[#8b949e]">
                        {ef.reached_nodes.map((nid) => (
                          <span
                            key={nid}
                            className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono"
                          >
                            {getNodeLabel(expandedNodes, nid)}
                          </span>
                        ))}
                        {ef.reached_nodes.length === 0 && (
                          <span className="text-[#30363d]">—</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!result && !loading && !error && expandedNodes.length > 0 && (
            <div className="mt-6 rounded-lg border border-[#30363d] bg-[#21262d]/40 p-4 text-center text-sm text-[#484f58]">
              Paste or upload JSON events, or generate sample events, then click Run Test.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
