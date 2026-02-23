"use client";

import { useState } from "react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_CATEGORIES, NODE_REGISTRY } from "@/lib/nodeRegistry";

const CATEGORY_COLORS: Record<string, string> = {
  blue: "border-l-blue-500 bg-blue-500/5",
  purple: "border-l-purple-500 bg-purple-500/5",
  green: "border-l-green-500 bg-green-500/5",
  orange: "border-l-orange-500 bg-orange-500/5",
};

interface NodePaletteProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function NodePalette({
  collapsed = false,
  onToggleCollapse,
}: NodePaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    source: true,
    pattern: true,
    transform: true,
    sink: true,
  } as Record<string, boolean>);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/reactflow", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col border-r border-slate-700 bg-slate-900/95">
        <button
          onClick={onToggleCollapse}
          className="flex h-12 items-center justify-center border-b border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          title="Expand palette"
        >
          <LucideIcons.PanelLeftOpen className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[250px] flex-col border-r border-slate-700 bg-slate-900/95">
      <div className="flex h-12 items-center justify-between border-b border-slate-700 px-4">
        <span className="font-medium text-slate-200">Node Palette</span>
        <button
          onClick={onToggleCollapse}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          title="Collapse palette"
        >
          <LucideIcons.PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {NODE_CATEGORIES.map((category) => {
          const isExpanded = expandedCategories[category.id] ?? true;
          const colorClass = CATEGORY_COLORS[category.color] ?? CATEGORY_COLORS.blue;

          return (
            <div key={category.id} className="mb-2">
              <button
                onClick={() => toggleCategory(category.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-800/50",
                  colorClass
                )}
              >
                <LucideIcons.ChevronDown
                  className={cn("h-4 w-4 transition-transform", !isExpanded && "-rotate-90")}
                />
                {category.label}
              </button>
              {isExpanded && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {category.nodes.map((nodeType) => {
                    const def = NODE_REGISTRY[nodeType];
                    if (!def) return null;
                    const IconComponent =
                      (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                        def.icon
                      ] ?? LucideIcons.Box;
                    return (
                      <div
                        key={nodeType}
                        draggable
                        onDragStart={(e) => handleDragStart(e, nodeType)}
                        className={cn(
                          "flex cursor-grab items-center gap-3 rounded-md px-3 py-2",
                          "border border-transparent hover:border-slate-600 hover:bg-slate-800/50",
                          "active:cursor-grabbing"
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-800">
                          <IconComponent className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-200">
                            {def.label}
                          </div>
                          {def.description && (
                            <div className="truncate text-xs text-slate-500">
                              {def.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
