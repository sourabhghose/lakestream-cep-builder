"use client";

import { useState, useMemo, useCallback } from "react";
import { PanelLeftOpen, PanelLeftClose, ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { NODE_CATEGORIES, NODE_REGISTRY } from "@/lib/nodeRegistry";
import { getNodeIcon } from "@/lib/iconRegistry";
import type { NodeDefinition } from "@/types/nodes";

const CATEGORY_COLORS: Record<string, string> = {
  blue: "border-l-blue-500 bg-blue-500/5",
  purple: "border-l-purple-500 bg-purple-500/5",
  green: "border-l-green-500 bg-green-500/5",
  orange: "border-l-orange-500 bg-orange-500/5",
};

function getCodeTargetLabel(def: NodeDefinition): string {
  const t = def.codeTarget;
  if (t === "sdp") return "SDP";
  if (t === "sss") return "SSS";
  if (t === "sdp-or-sss") return "Both (SDP & SSS)";
  return "Both";
}

function getRequiredConfigFields(def: NodeDefinition): string[] {
  const fields: string[] = [];
  for (const f of def.configFields ?? []) {
    if (f.required) fields.push(f.label);
  }
  for (const f of def.advancedFields ?? []) {
    if (f.required) fields.push(f.label);
  }
  return fields;
}

interface NodePaletteProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function NodePalette({
  collapsed = false,
  onToggleCollapse,
}: NodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    source: true,
    pattern: true,
    transform: true,
    sink: true,
  } as Record<string, boolean>);
  const [expandedCategoryNodes, setExpandedCategoryNodes] = useState<Record<string, boolean>>({});
  const NODES_BEFORE_SHOW_MORE = 5;

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/reactflow", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return NODE_CATEGORIES;
    return NODE_CATEGORIES.map((cat) => ({
      ...cat,
      nodes: cat.nodes.filter((nodeType) => {
        const def = NODE_REGISTRY[nodeType];
        return def?.label?.toLowerCase().includes(q);
      }),
    })).filter((cat) => cat.nodes.length > 0);
  }, [searchQuery]);

  const allExpanded = useMemo(() => {
    return filteredCategories.every((cat) => expandedCategories[cat.id] ?? true);
  }, [filteredCategories, expandedCategories]);

  const toggleExpandAll = useCallback(() => {
    const next = allExpanded ? false : true;
    setExpandedCategories((prev) => {
      const nextState = { ...prev };
      filteredCategories.forEach((cat) => {
        nextState[cat.id] = next;
      });
      return nextState;
    });
  }, [allExpanded, filteredCategories]);

  const toggleShowMore = (categoryId: string) => {
    setExpandedCategoryNodes((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/95">
        <button
          onClick={onToggleCollapse}
          className="flex h-12 items-center justify-center border-b border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          title="Expand palette"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[250px] flex-col border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex h-12 items-center justify-between border-b border-slate-700 px-4">
        <span className="font-medium text-slate-200">Node Palette</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleExpandAll}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title={allExpanded ? "Collapse all" : "Expand all"}
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onToggleCollapse}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Collapse palette"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-b border-slate-700 px-2 pb-2">
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filteredCategories.map((category) => {
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
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", !isExpanded && "-rotate-90")}
                />
                {category.label}
              </button>
              {isExpanded && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {(expandedCategoryNodes[category.id] ||
                    category.nodes.length <= NODES_BEFORE_SHOW_MORE
                    ? category.nodes
                    : category.nodes.slice(0, NODES_BEFORE_SHOW_MORE)
                  ).map((nodeType) => {
                    const def = NODE_REGISTRY[nodeType];
                    if (!def) return null;
                    const IconComponent = getNodeIcon(def.icon);
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
                  {category.nodes.length > NODES_BEFORE_SHOW_MORE && (
                    <button
                      onClick={() => toggleShowMore(category.id)}
                      className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
                    >
                      {expandedCategoryNodes[category.id]
                        ? "Show less"
                        : `Show more (${category.nodes.length - NODES_BEFORE_SHOW_MORE})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
