"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Loader2, Send, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { aiGeneratePipeline } from "@/lib/api";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import type { Node, Edge } from "@xyflow/react";

interface AIAssistDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  "Fraud detection: read credit card transactions from Kafka, detect >3 transactions from the same card within 5 minutes, alert via email and write to Delta",
  "IoT monitoring: simulate sensor data, filter temperature > 80, detect absence of readings for 10 minutes, send PagerDuty alerts",
  "Clickstream analytics: Kafka click events, session detection with 30-min gap, window aggregate page views per session, write to Delta Lake",
  "E-commerce orders: Kafka order events, filter high-value orders > $500, enrich with customer lookup table, write to Unity Catalog",
  "Fleet tracking: two Kafka streams (GPS + speed), stream-stream join, geofence detection for warehouse zones, alert on entry/exit",
];

export default function AIAssistDialog({ isOpen, onClose }: AIAssistDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadPipeline = usePipelineStore((s) => s.loadPipeline);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || prompt.trim().length < 10) {
      setError("Please describe your pipeline in at least 10 characters.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await aiGeneratePipeline(prompt.trim());

      const nodes: Node[] = result.nodes.map((n) => ({
        id: n.id,
        type: "custom",
        position: { x: n.x, y: n.y },
        data: {
          type: n.type,
          label: n.label,
          config: n.config,
          configSummary: "",
        },
      }));

      const edges: Edge[] = result.edges.map((e) => ({
        id: `e-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
      }));

      loadPipeline(nodes, edges, result.name, result.description);
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : err instanceof Error
          ? err.message
          : "An unexpected error occurred";
      setError(msg ?? "Failed to generate pipeline. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-lg border border-[#30363d] bg-[#161b22] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#30363d] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#e8eaed]">AI Pipeline Generator</h2>
              <p className="text-xs text-[#8b949e]">Powered by Claude Sonnet on Databricks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Prompt input */}
        <div className="p-5">
          <label htmlFor="ai-prompt" className="mb-2 block text-sm font-medium text-[#c9d1d9]">
            Describe your streaming pipeline
          </label>
          <div className="relative">
            <textarea
              ref={inputRef}
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Build a fraud detection pipeline that reads credit card transactions from Kafka, detects rapid-fire transactions from the same card, and sends alerts..."
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-4 py-3 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#1f6feb] focus:outline-none focus:ring-1 focus:ring-[#1f6feb] resize-none"
              rows={4}
              disabled={isGenerating}
            />
          </div>
          <p className="mt-1.5 text-xs text-[#484f58]">
            Press <kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5 text-[10px]">⌘</kbd>+<kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5 text-[10px]">Enter</kbd> to generate
          </p>

          {error && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Example prompts */}
        <div className="border-t border-[#30363d] px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#8b949e]">
            <Lightbulb className="h-3.5 w-3.5" />
            Example prompts
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="rounded-full border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9] transition-colors truncate max-w-[280px]"
                title={example}
                disabled={isGenerating}
              >
                {example.split(":")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-[#30363d] px-5 py-4">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-all",
              isGenerating
                ? "bg-purple-600/50 text-purple-200 cursor-wait"
                : "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating pipeline...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Pipeline
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
