"use client";

import { memo } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import * as LucideIcons from "lucide-react";

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  source: "border-node-source",
  "cep-pattern": "border-node-pattern",
  pattern: "border-node-pattern",
  transform: "border-node-transform",
  sink: "border-node-sink",
};

function CustomNode({ data, selected }: NodeProps) {
  const def = NODE_REGISTRY[data.type as keyof typeof NODE_REGISTRY] ?? {
    label: data.label ?? "Unknown",
    description: "",
    category: "transform",
    codeTarget: "sdp-or-sss",
  };

  const category = def.category ?? "transform";
  const borderColor = CATEGORY_BORDER_COLORS[category] ?? "border-node-transform";
  const hasError = data.hasError === true;

  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
      def.icon ?? "Box"
    ] ?? LucideIcons.Box;

  const badges: string[] = [];
  if (def.codeTarget === "sdp" || def.codeTarget === "sdp-or-sss") badges.push("SDP");
  if (def.codeTarget === "sss" || def.codeTarget === "sdp-or-sss") badges.push("SSS");

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border-2 bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur",
        borderColor,
        selected && "ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-950",
        hasError && "border-red-500"
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500" />

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-800">
          <IconComponent className="h-4 w-4 text-slate-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-100">
              {String(data.label ?? def.label ?? "Unknown")}
            </span>
            {hasError && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                Error
              </span>
            )}
          </div>
          {data.configSummary != null && data.configSummary !== "" && (
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {String(data.configSummary)}
            </p>
          )}
          {badges.length > 0 && (
            <div className="mt-2 flex gap-1">
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(CustomNode);
