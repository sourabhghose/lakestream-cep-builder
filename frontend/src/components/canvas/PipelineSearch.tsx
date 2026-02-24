"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import { usePipelineStore } from "@/hooks/usePipelineStore";

/** Recursively collect all stringifiable values from an object for search */
function collectConfigValues(obj: unknown): string[] {
  if (obj == null) return [];
  if (typeof obj === "string") return [obj];
  if (typeof obj === "number" || typeof obj === "boolean") return [String(obj)];
  if (Array.isArray(obj)) return obj.flatMap(collectConfigValues);
  if (typeof obj === "object") {
    return Object.values(obj).flatMap(collectConfigValues);
  }
  return [];
}

function nodeMatchesQuery(node: Node, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const label = String(node.data?.label ?? "").toLowerCase();
  const type = String(node.data?.type ?? "").toLowerCase();
  const configValues = collectConfigValues(node.data?.config ?? {});
  const configStr = configValues.join(" ").toLowerCase();

  return (
    label.includes(q) ||
    type.includes(q) ||
    configStr.includes(q)
  );
}

export default function PipelineSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { nodes, applySearchHighlights } = usePipelineStore();
  const { setCenter } = useReactFlow();

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return nodes.filter((n) => nodeMatchesQuery(n, q));
  }, [nodes, query]);

  const totalNodes = nodes.length;
  const matchCount = matches.length;

  const goToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const idx = ((index % matches.length) + matches.length) % matches.length;
      setSelectedIndex(idx);
      const node = matches[idx];
      if (node) {
        const cx = node.position.x + 90;
        const cy = node.position.y + 40;
        setCenter(cx, cy, { duration: 300 });
      }
    },
    [matches, setCenter]
  );

  const handlePrev = useCallback(() => {
    goToMatch(selectedIndex - 1);
  }, [selectedIndex, goToMatch]);

  const handleNext = useCallback(() => {
    goToMatch(selectedIndex + 1);
  }, [selectedIndex, goToMatch]);

  const prevMatchKeyRef = useRef("");

  useEffect(() => {
    const matchedIds = new Set(matches.map((n) => n.id));
    const key = Array.from(matchedIds).sort().join(",");
    if (key === prevMatchKeyRef.current) return;
    prevMatchKeyRef.current = key;
    applySearchHighlights(matchedIds);
  }, [matches, applySearchHighlights]);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
    applySearchHighlights(new Set());
  }, [applySearchHighlights]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSearch();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSearch]);

  useEffect(() => {
    if (matches.length > 0 && selectedIndex >= matches.length) {
      setSelectedIndex(0);
    }
  }, [matches.length, selectedIndex]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#21262d]/95 px-3 py-2 text-sm text-[#c9d1d9] shadow-lg backdrop-blur hover:border-[#484f58] hover:bg-[#30363d]/95"
        title="Search nodes (Ctrl+F / Cmd+F)"
      >
        <Search className="h-4 w-4" />
        <span>Search</span>
      </button>
    );
  }

  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#21262d]/95 px-3 py-2 shadow-lg backdrop-blur">
      <Search className="h-4 w-4 shrink-0 text-[#8b949e]" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        placeholder="Search nodes..."
        className="w-48 bg-transparent text-sm text-[#f0f6fc] placeholder-[#484f58] outline-none"
        ref={inputRef}
        autoFocus
      />
      <span className="shrink-0 text-xs text-[#484f58]">
        {matchCount} of {totalNodes} nodes
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={handlePrev}
          disabled={matches.length === 0}
          className="rounded p-1 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8b949e]"
          title="Previous match"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={matches.length === 0}
          className="rounded p-1 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8b949e]"
          title="Next match"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={closeSearch}
        className="shrink-0 rounded p-1 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
        title="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
