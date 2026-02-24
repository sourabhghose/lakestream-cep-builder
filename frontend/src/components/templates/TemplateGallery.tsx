"use client";

import { useState, useMemo } from "react";
import { LayoutTemplate, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_TEMPLATES,
  type PipelineTemplate,
  type TemplateDifficulty,
} from "@/lib/templates";
import TemplateCard from "./TemplateCard";
import { usePipelineStore } from "@/hooks/usePipelineStore";

const INDUSTRIES = [
  "All",
  ...Array.from(new Set(PIPELINE_TEMPLATES.map((t) => t.industry))),
];

const DIFFICULTIES: TemplateDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

interface TemplateGalleryProps {
  onClose?: () => void;
  className?: string;
}

export default function TemplateGallery({
  onClose,
  className,
}: TemplateGalleryProps) {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("All");
  const [difficulty, setDifficulty] = useState<TemplateDifficulty | "all">(
    "all"
  );
  const [previewId, setPreviewId] = useState<string | null>(null);

  const loadPipeline = usePipelineStore((s) => s.loadPipeline);

  const filteredTemplates = useMemo(() => {
    return PIPELINE_TEMPLATES.filter((t) => {
      const matchSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
        t.industry.toLowerCase().includes(search.toLowerCase());
      const matchIndustry = industry === "All" || t.industry === industry;
      const matchDifficulty =
        difficulty === "all" || t.difficulty === difficulty;
      return matchSearch && matchIndustry && matchDifficulty;
    });
  }, [search, industry, difficulty]);

  const handleUseTemplate = (template: PipelineTemplate) => {
    loadPipeline(
      template.nodes,
      template.edges,
      template.name,
      template.description
    );
    onClose?.();
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-[#30363d] bg-[#161b22]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-[#e8eaed]">
          <LayoutTemplate className="h-5 w-5" />
          Use Case Templates
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1.5 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-b border-[#30363d] px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#484f58]" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#30363d] bg-[#21262d] py-2 pl-9 pr-3 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
          />
        </div>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none"
        >
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) =>
            setDifficulty(e.target.value as TemplateDifficulty | "all")
          }
          className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none"
        >
          <option value="all">All levels</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#484f58]">
            <Search className="mb-2 h-10 w-10" />
            <p className="text-sm">No templates match your filters</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={() => handleUseTemplate(template)}
                onPreview={() =>
                  setPreviewId(previewId === template.id ? null : template.id)
                }
                isPreviewing={previewId === template.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
