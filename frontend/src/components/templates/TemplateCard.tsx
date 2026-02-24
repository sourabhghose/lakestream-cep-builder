"use client";

import {
  DollarSign,
  ShoppingCart,
  Factory,
  Layers,
  Cloud,
  Settings,
  Megaphone,
  Truck,
  Shield,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineTemplate, TemplateDifficulty } from "@/lib/templates";

const INDUSTRY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FinServ: DollarSign,
  "E-commerce": ShoppingCart,
  Manufacturing: Factory,
  Any: Layers,
  SaaS: Cloud,
  Operations: Settings,
  Marketing: Megaphone,
  Logistics: Truck,
  Cybersecurity: Shield,
  "Supply Chain": Package,
};

const INDUSTRY_COLORS: Record<string, string> = {
  FinServ: "border-l-[#58a6ff] bg-[#58a6ff]/10",
  "E-commerce": "border-l-emerald-500 bg-emerald-500/10",
  Manufacturing: "border-l-amber-500 bg-amber-500/10",
  Any: "border-l-[#484f58] bg-[#484f58]/10",
  SaaS: "border-l-violet-500 bg-violet-500/10",
  Operations: "border-l-orange-500 bg-orange-500/10",
  Marketing: "border-l-pink-500 bg-pink-500/10",
  Logistics: "border-l-cyan-500 bg-cyan-500/10",
  Cybersecurity: "border-l-red-500 bg-red-500/10",
  "Supply Chain": "border-l-teal-500 bg-teal-500/10",
};

const DIFFICULTY_STYLES: Record<TemplateDifficulty, string> = {
  beginner: "bg-green-600/20 text-green-400 border-green-600/40",
  intermediate: "bg-amber-600/20 text-amber-400 border-amber-600/40",
  advanced: "bg-red-600/20 text-red-400 border-red-600/40",
};

interface TemplateCardProps {
  template: PipelineTemplate;
  onUse: () => void;
  onPreview?: () => void;
  isPreviewing?: boolean;
  className?: string;
}

export default function TemplateCard({
  template,
  onUse,
  onPreview,
  isPreviewing = false,
  className,
}: TemplateCardProps) {
  const industryColor =
    INDUSTRY_COLORS[template.industry] ?? INDUSTRY_COLORS.Any;
  const difficultyStyle = DIFFICULTY_STYLES[template.difficulty];
  const IconComponent =
    INDUSTRY_ICON_MAP[template.industry] ?? Layers;

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22]/80 transition-all hover:border-[#30363d] hover:bg-[#21262d] hover:shadow-lg",
        industryColor,
        "border-l-4",
        className
      )}
    >
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#21262d]">
            <IconComponent className="h-5 w-5 text-[#c9d1d9]" />
          </div>
          <span
            className={cn(
              "shrink-0 rounded border px-2 py-0.5 text-xs font-medium",
              difficultyStyle
            )}
          >
            {template.difficulty}
          </span>
        </div>
        <h3 className="mb-1 font-semibold text-[#e8eaed]">{template.name}</h3>
        <p className="mb-3 line-clamp-2 text-sm text-[#8b949e]">
          {template.description}
        </p>
        <div className="mt-auto flex items-center gap-2">
          <span className="rounded bg-[#30363d]/50 px-2 py-0.5 text-xs text-[#8b949e]">
            {template.industry}
          </span>
          <span className="text-xs text-[#484f58]">
            {template.nodes.length} nodes
          </span>
        </div>
      </div>
      <div className="flex gap-2 border-t border-[#30363d] p-3">
        {onPreview && (
          <button
            onClick={onPreview}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition",
              isPreviewing
                ? "border-purple-500 bg-purple-600/20 text-purple-300"
                : "border-[#30363d] bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed]"
            )}
          >
            Preview
          </button>
        )}
        <button
          onClick={onUse}
          className="flex-1 rounded-md bg-[#1f6feb] px-3 py-2 text-sm font-medium text-white hover:bg-[#388bfd]"
        >
          Use Template
        </button>
      </div>
    </div>
  );
}
