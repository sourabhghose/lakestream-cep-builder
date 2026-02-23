"use client";

import { useState } from "react";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import PatternTimeline from "./PatternTimeline";
import TimelineControls from "./TimelineControls";
import type { NodeType } from "@/types/nodes";

const CEP_PATTERN_TYPES = new Set([
  "sequence-detector",
  "absence-detector",
  "count-threshold",
  "velocity-detector",
  "geofence-location",
  "temporal-correlation",
  "trend-detector",
  "outlier-anomaly",
  "session-detector",
  "deduplication",
  "match-recognize-sql",
  "custom-stateful-processor",
]);

interface SampleEvent {
  id: string;
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export default function PatternTimelinePanel() {
  const { selectedNodeId, nodes } = usePipelineStore();
  const [sampleEvents, setSampleEvents] = useState<SampleEvent[]>([]);
  const [mode, setMode] = useState<"design" | "test">("design");

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeType = selectedNode?.data?.type as NodeType | undefined;

  if (!nodeType || !CEP_PATTERN_TYPES.has(nodeType)) {
    return null;
  }

  const definition = NODE_REGISTRY[nodeType];
  if (!definition) return null;

  const config = (selectedNode?.data?.config as Record<string, unknown>) || {};

  const pattern = buildPatternFromConfig(nodeType, config);

  const handleLoadData = (data: unknown) => {
    if (Array.isArray(data)) {
      setSampleEvents(
        data.map((item: Record<string, unknown>, i: number) => ({
          id: (item.id as string) || `event-${i}`,
          type: (item.type as string) || (item.event_type as string) || "unknown",
          timestamp: (item.timestamp as number) || Date.now() + i * 1000,
          data: item,
        }))
      );
      setMode("test");
    }
  };

  return (
    <div className="border-t border-slate-700 bg-slate-900/80">
      <div className="flex items-center justify-between px-3 py-2">
        <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Pattern Timeline — {definition.label}
        </h4>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("design")}
            className={`rounded px-2 py-1 text-xs ${
              mode === "design"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            Design
          </button>
          <button
            onClick={() => setMode("test")}
            className={`rounded px-2 py-1 text-xs ${
              mode === "test"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            Test
          </button>
        </div>
      </div>
      <PatternTimeline
        pattern={pattern}
        events={mode === "test" ? sampleEvents : undefined}
        matches={[]}
        mode={mode}
        height={180}
      />
      <TimelineControls
        onLoadSampleData={handleLoadData}
        hasData={sampleEvents.length > 0}
      />
    </div>
  );
}

function buildPatternFromConfig(
  nodeType: string,
  config: Record<string, unknown>
): {
  steps: { name: string; filter: string }[];
  within?: string;
  contiguity?: string;
} {
  switch (nodeType) {
    case "sequence-detector": {
      const steps = (
        config.steps as { name: string; filter: string }[] | undefined
      ) || [
        { name: "A", filter: "event_type = 'start'" },
        { name: "B", filter: "event_type = 'middle'" },
        { name: "C", filter: "event_type = 'end'" },
      ];
      return {
        steps,
        within: (config.within as string) || "30m",
        contiguity: (config.contiguity as string) || "relaxed",
      };
    }
    case "absence-detector":
      return {
        steps: [
          {
            name: "Trigger",
            filter:
              (config.triggerEventFilter as string) || "event_type = 'start'",
          },
          {
            name: "Expected (absent)",
            filter:
              (config.expectedEventFilter as string) ||
              "event_type = 'complete'",
          },
        ],
        within: (config.timeoutDuration as string) || "1h",
      };
    case "count-threshold":
      return {
        steps: [
          {
            name: "Event",
            filter: (config.eventFilter as string) || "event_type = 'click'",
          },
        ],
        within: (config.windowDuration as string) || "5m",
      };
    case "velocity-detector":
      return {
        steps: [
          {
            name: "Event",
            filter: (config.eventFilter as string) || "event_type = 'request'",
          },
        ],
        within: (config.windowDuration as string) || "1m",
      };
    default:
      return {
        steps: [{ name: "Event", filter: "all events" }],
        within: "10m",
      };
  }
}
