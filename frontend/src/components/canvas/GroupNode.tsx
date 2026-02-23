"use client";

import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Maximize2, Ungroup } from "lucide-react";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { getNodeIcon } from "@/lib/iconRegistry";
import { NODE_REGISTRY } from "@/lib/nodeRegistry";
import { cn } from "@/lib/utils";

function GroupNodeInner({ id, data, selected }: NodeProps) {
  const toggleGroupCollapse = usePipelineStore((s) => s.toggleGroupCollapse);
  const ungroupNodes = usePipelineStore((s) => s.ungroupNodes);
  const groupId = data.groupId as string;
  const name = (data.name as string) ?? "Group";
  const nodeCount = (data.nodeCount as number) ?? 0;
  const nodeTypes = (data.nodeTypes as string[]) ?? [];

  const handleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (groupId) toggleGroupCollapse(groupId);
    },
    [groupId, toggleGroupCollapse]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (groupId) toggleGroupCollapse(groupId);
    },
    [groupId, toggleGroupCollapse]
  );

  const handleUngroup = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (groupId) ungroupNodes(groupId);
    },
    [groupId, ungroupNodes]
  );

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border-2 border-dashed border-slate-500 bg-slate-800/60 px-4 py-3 shadow-lg backdrop-blur dark:bg-slate-800/80",
        selected && "ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-950"
      )}
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-500"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-500"
        isConnectable={false}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-200 truncate">{name}</div>
          <div className="mt-1 text-xs text-slate-400">
            {nodeCount} node{nodeCount !== 1 ? "s" : ""}
          </div>
          {nodeTypes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {nodeTypes.slice(0, 4).map((type) => {
                const def = NODE_REGISTRY[type as keyof typeof NODE_REGISTRY];
                const IconComponent = def
                  ? getNodeIcon(def.icon)
                  : getNodeIcon("Box");
                return (
                  <div
                    key={type}
                    className="flex h-6 w-6 items-center justify-center rounded bg-slate-700/80"
                    title={def?.label ?? type}
                  >
                    <IconComponent className="h-3 w-3 text-slate-300" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={handleExpand}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            title="Expand group"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleUngroup}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            title="Ungroup"
          >
            <Ungroup className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(GroupNodeInner);
