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
        "min-w-[200px] rounded-lg border-2 border-dashed border-[#30363d] bg-[#1e2329]/80 px-4 py-3 shadow-lg backdrop-blur",
        selected && "ring-2 ring-[#58a6ff] ring-offset-2 ring-offset-[#1b1f23]"
      )}
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-[#484f58]"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-[#484f58]"
        isConnectable={false}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[#e8eaed] truncate">{name}</div>
          <div className="mt-1 text-xs text-[#8b949e]">
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
                    className="flex h-6 w-6 items-center justify-center rounded bg-[#30363d]"
                    title={def?.label ?? type}
                  >
                    <IconComponent className="h-3 w-3 text-[#c9d1d9]" />
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
            className="rounded p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
            title="Expand group"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleUngroup}
            className="rounded p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
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
