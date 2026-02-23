"use client";

import { useMemo } from "react";

interface PatternStep {
  name: string;
  filter: string;
}

interface PatternEvent {
  id: string;
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface PatternMatch {
  events: string[];
  matchedAt: number;
}

interface PatternTimelineProps {
  pattern: {
    steps: PatternStep[];
    within?: string;
    contiguity?: string;
  };
  events?: PatternEvent[];
  matches?: PatternMatch[];
  mode: "design" | "test";
  height?: number;
}

const STEP_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export default function PatternTimeline({
  pattern,
  events = [],
  matches = [],
  mode,
  height = 200,
}: PatternTimelineProps) {
  const padding = { top: 30, right: 40, bottom: 30, left: 120 };
  const laneHeight = Math.max(
    36,
    (height - padding.top - padding.bottom) / Math.max(pattern.steps.length, 1)
  );
  const svgHeight =
    padding.top + pattern.steps.length * laneHeight + padding.bottom;

  const timeRange = useMemo(() => {
    if (mode === "test" && events.length > 0) {
      const times = events.map((e) => e.timestamp);
      return { min: Math.min(...times), max: Math.max(...times) };
    }
    return { min: 0, max: pattern.steps.length * 100 };
  }, [events, mode, pattern.steps.length]);

  const xScale = (t: number, width: number) => {
    const range = timeRange.max - timeRange.min || 1;
    return (
      padding.left + ((t - timeRange.min) / range) * (width - padding.left - padding.right)
    );
  };

  if (mode === "design") {
    return (
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 600 ${svgHeight}`}
        className="bg-slate-900 rounded-md"
      >
        {pattern.steps.map((step, i) => {
          const y = padding.top + i * laneHeight;
          const color = STEP_COLORS[i % STEP_COLORS.length];
          const cx = padding.left + (i + 0.5) * ((600 - padding.left - padding.right) / pattern.steps.length);

          return (
            <g key={step.name}>
              {/* Lane label */}
              <text
                x={padding.left - 10}
                y={y + laneHeight / 2 + 4}
                textAnchor="end"
                className="fill-slate-400 text-xs"
                fontSize={11}
              >
                {step.name}
              </text>

              {/* Lane line */}
              <line
                x1={padding.left}
                y1={y + laneHeight / 2}
                x2={600 - padding.right}
                y2={y + laneHeight / 2}
                stroke="#334155"
                strokeWidth={1}
                strokeDasharray="4 4"
              />

              {/* Event dot */}
              <circle
                cx={cx}
                cy={y + laneHeight / 2}
                r={10}
                fill={color}
                opacity={0.8}
              />
              <text
                x={cx}
                y={y + laneHeight / 2 + 4}
                textAnchor="middle"
                className="fill-white font-medium"
                fontSize={10}
              >
                {step.name}
              </text>

              {/* Filter label */}
              <text
                x={cx}
                y={y + laneHeight / 2 + 22}
                textAnchor="middle"
                className="fill-slate-500"
                fontSize={9}
              >
                {step.filter.length > 25
                  ? step.filter.slice(0, 22) + "..."
                  : step.filter}
              </text>

              {/* Arrow to next step */}
              {i < pattern.steps.length - 1 && (
                <line
                  x1={cx + 12}
                  y1={y + laneHeight / 2}
                  x2={
                    padding.left +
                    (i + 1.5) *
                      ((600 - padding.left - padding.right) /
                        pattern.steps.length) -
                    12
                  }
                  y2={padding.top + (i + 1) * laneHeight + laneHeight / 2}
                  stroke="#64748b"
                  strokeWidth={1.5}
                  markerEnd="url(#arrowhead)"
                />
              )}
            </g>
          );
        })}

        {/* WITHIN constraint */}
        {pattern.within && (
          <g>
            <rect
              x={padding.left}
              y={padding.top - 6}
              width={600 - padding.left - padding.right}
              height={pattern.steps.length * laneHeight + 12}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="6 3"
              rx={6}
            />
            <text
              x={600 - padding.right - 4}
              y={padding.top - 10}
              textAnchor="end"
              className="fill-blue-400"
              fontSize={10}
            >
              WITHIN {pattern.within}
            </text>
          </g>
        )}

        {/* Contiguity label */}
        {pattern.contiguity && (
          <text
            x={padding.left}
            y={padding.top - 10}
            className="fill-slate-500"
            fontSize={10}
          >
            {pattern.contiguity} contiguity
          </text>
        )}

        {/* Arrow marker */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6 Z" fill="#64748b" />
          </marker>
        </defs>
      </svg>
    );
  }

  // Test mode
  const stepFilters = pattern.steps.map((s) => s.filter.toLowerCase());
  const matchedEventIds = new Set(matches.flatMap((m) => m.events));

  return (
    <svg
      width="100%"
      height={svgHeight}
      viewBox={`0 0 600 ${svgHeight}`}
      className="bg-slate-900 rounded-md"
    >
      {/* Lanes */}
      {pattern.steps.map((step, i) => {
        const y = padding.top + i * laneHeight;
        return (
          <g key={step.name}>
            <text
              x={padding.left - 10}
              y={y + laneHeight / 2 + 4}
              textAnchor="end"
              className="fill-slate-400 text-xs"
              fontSize={11}
            >
              {step.name}
            </text>
            <line
              x1={padding.left}
              y1={y + laneHeight / 2}
              x2={600 - padding.right}
              y2={y + laneHeight / 2}
              stroke="#1e293b"
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* Events */}
      {events.map((event) => {
        const stepIdx = stepFilters.findIndex(
          (f) =>
            event.type.toLowerCase().includes(f) ||
            f.includes(event.type.toLowerCase())
        );
        if (stepIdx === -1) return null;

        const y = padding.top + stepIdx * laneHeight + laneHeight / 2;
        const cx = xScale(event.timestamp, 600);
        const isMatched = matchedEventIds.has(event.id);

        return (
          <circle
            key={event.id}
            cx={cx}
            cy={y}
            r={5}
            fill={isMatched ? "#22c55e" : "#64748b"}
            opacity={isMatched ? 1 : 0.5}
          />
        );
      })}

      {/* Match arcs */}
      {matches.map((match, i) => {
        const matchEvents = match.events
          .map((id) => events.find((e) => e.id === id))
          .filter(Boolean);
        if (matchEvents.length < 2) return null;

        const points = matchEvents.map((e) => {
          const stepIdx = stepFilters.findIndex(
            (f) =>
              e!.type.toLowerCase().includes(f) ||
              f.includes(e!.type.toLowerCase())
          );
          return {
            x: xScale(e!.timestamp, 600),
            y: padding.top + stepIdx * laneHeight + laneHeight / 2,
          };
        });

        const pathD = points
          .map((p, j) => (j === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
          .join(" ");

        return (
          <path
            key={`match-${i}`}
            d={pathD}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2}
            opacity={0.6}
          />
        );
      })}

      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="#64748b" />
        </marker>
      </defs>
    </svg>
  );
}
