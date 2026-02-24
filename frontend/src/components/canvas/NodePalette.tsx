"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { PanelLeftOpen, PanelLeftClose, ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_CATEGORIES, NODE_REGISTRY } from "@/lib/nodeRegistry";
import { getNodeIcon } from "@/lib/iconRegistry";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import type { Node } from "@xyflow/react";
import type { NodeDefinition } from "@/types/nodes";

const CATEGORY_COLORS: Record<string, string> = {
  blue: "border-l-[#58a6ff] bg-[#58a6ff]/5",
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
  const addNode = usePipelineStore((s) => s.addNode);
  const nodes = usePipelineStore((s) => s.nodes);
  const triggerCodeGen = usePipelineStore((s) => s.triggerCodeGen);
  const [searchQuery, setSearchQuery] = useState("");
  const nodeRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map());
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

  const flatNodeList = useMemo(() => {
    const list: { categoryIdx: number; nodeIdx: number; nodeType: string }[] = [];
    filteredCategories.forEach((category, catIdx) => {
      if (!(expandedCategories[category.id] ?? true)) return;
      const nodeList =
        expandedCategoryNodes[category.id] || category.nodes.length <= NODES_BEFORE_SHOW_MORE
          ? category.nodes
          : category.nodes.slice(0, NODES_BEFORE_SHOW_MORE);
      nodeList.forEach((nodeType, nodeIdx) => {
        list.push({ categoryIdx: catIdx, nodeIdx, nodeType });
      });
    });
    return list;
  }, [filteredCategories, expandedCategories, expandedCategoryNodes]);

  const handleNodeKeyDown = useCallback(
    (e: React.KeyboardEvent, categoryIdx: number, nodeIdx: number, nodeType: string) => {
      const idx = flatNodeList.findIndex(
        (n) => n.categoryIdx === categoryIdx && n.nodeIdx === nodeIdx && n.nodeType === nodeType
      );
      if (idx < 0) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const def = NODE_REGISTRY[nodeType as keyof typeof NODE_REGISTRY];
        if (!def) return;
        const position = { x: 150 + nodes.length * 50, y: 150 };
        const newNode: Node = {
          id: `${nodeType}-${Date.now()}`,
          type: "custom",
          position,
          data: {
            type: nodeType,
            label: def.label,
            config: {},
            codeTarget: def.codeTarget,
            configSummary: "",
          },
        };
        addNode(newNode);
        triggerCodeGen();
        return;
      }
      if (e.key === "ArrowDown" && idx < flatNodeList.length - 1) {
        e.preventDefault();
        const next = flatNodeList[idx + 1];
        const el = nodeRefsMap.current.get(`${next.categoryIdx}-${next.nodeIdx}-${next.nodeType}`);
        el?.focus();
        return;
      }
      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        const prev = flatNodeList[idx - 1];
        const el = nodeRefsMap.current.get(`${prev.categoryIdx}-${prev.nodeIdx}-${prev.nodeType}`);
        el?.focus();
        return;
      }
    },
    [flatNodeList, addNode, nodes.length, triggerCodeGen]
  );

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col border-r border-[#30363d] bg-[#161b22]">
        <button
          onClick={onToggleCollapse}
          className="flex h-12 items-center justify-center border-b border-[#30363d] text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
          title="Expand palette"
          aria-label="Expand node palette"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-[250px] flex-col overflow-hidden border-r border-[#30363d] bg-[#161b22]">
      <div className="flex h-12 items-center justify-between border-b border-[#30363d] px-4">
        <span className="font-medium text-[#e8eaed]">Node Palette</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleExpandAll}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            title={allExpanded ? "Collapse all" : "Expand all"}
            aria-label={allExpanded ? "Collapse all categories" : "Expand all categories"}
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onToggleCollapse}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            title="Collapse palette"
            aria-label="Collapse node palette"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-b border-[#30363d] px-2 pb-2">
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#6e7681] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
          aria-label="Search nodes"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filteredCategories.map((category, categoryIdx) => {
          const isExpanded = expandedCategories[category.id] ?? true;
          const colorClass = CATEGORY_COLORS[category.color] ?? CATEGORY_COLORS.blue;

          return (
            <div key={category.id} className="mb-2">
              <button
                onClick={() => toggleCategory(category.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#e8eaed] transition hover:bg-[#21262d]/50",
                  colorClass
                )}
                aria-label={`${category.label} category, ${isExpanded ? "collapse" : "expand"}`}
                aria-expanded={isExpanded}
              >
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", !isExpanded && "-rotate-90")}
                />
                {category.label}
              </button>
              {isExpanded && (
                <div
                  className="mt-1 space-y-0.5 pl-2"
                  role="listbox"
                  aria-label={`${category.label} nodes`}
                >
                  {(expandedCategoryNodes[category.id] ||
                    category.nodes.length <= NODES_BEFORE_SHOW_MORE
                    ? category.nodes
                    : category.nodes.slice(0, NODES_BEFORE_SHOW_MORE)
                  ).map((nodeType, nodeIdx) => {
                    const def = NODE_REGISTRY[nodeType];
                    if (!def) return null;
                    const IconComponent = getNodeIcon(def.icon);
                    const refKey = `${categoryIdx}-${nodeIdx}-${nodeType}`;
                    return (
                      <div
                        key={nodeType}
                        ref={(el) => {
                          nodeRefsMap.current.set(refKey, el);
                        }}
                        role="option"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => handleDragStart(e, nodeType)}
                        onKeyDown={(e) =>
                          handleNodeKeyDown(e, categoryIdx, nodeIdx, nodeType)
                        }
                        aria-label={`${def.label}${def.description ? `, ${def.description}` : ""}. Press Enter to add to canvas.`}
                        className={cn(
                          "flex cursor-grab items-center gap-3 rounded-md px-3 py-2",
                          "border border-transparent hover:border-[#30363d] hover:bg-[#21262d]/50",
                          "active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-[#58a6ff] focus:ring-inset"
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#21262d]">
                          <IconComponent className="h-4 w-4 text-[#8b949e]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[#e8eaed]">
                            {def.label}
                          </div>
                          {def.description && (
                            <div className="truncate text-xs text-[#6e7681]">
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
                      className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-[#6e7681] hover:bg-[#21262d]/50 hover:text-[#c9d1d9]"
                      aria-label={
                        expandedCategoryNodes[category.id]
                          ? "Show fewer nodes"
                          : `Show more nodes, ${category.nodes.length - NODES_BEFORE_SHOW_MORE} more`
                      }
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
