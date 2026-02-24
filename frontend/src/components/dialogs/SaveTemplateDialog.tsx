"use client";

import { useState, useEffect } from "react";
import { X, Loader2, LayoutTemplate } from "lucide-react";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";
import * as api from "@/lib/api";

interface SaveTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SaveTemplateDialog({
  isOpen,
  onClose,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [saving, setSaving] = useState(false);
  const { nodes, edges, pipelineName } = usePipelineStore();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (isOpen) {
      setName(pipelineName);
      setDescription("");
      setIndustry("");
    }
  }, [isOpen, pipelineName]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      addToast("Template name is required", "error");
      return;
    }
    if (nodes.length === 0) {
      addToast("Add at least one node to save as template", "error");
      return;
    }
    setSaving(true);
    try {
      await api.createTemplate({
        name: trimmedName,
        description: description.trim(),
        industry: industry.trim(),
        canvas_json: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? null,
            targetHandle: e.targetHandle ?? null,
          })),
        },
      });
      addToast("Template saved successfully", "success");
      onClose();
    } catch {
      addToast("Failed to save template", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#e8eaed]">
            <LayoutTemplate className="h-5 w-5" />
            Save as Template
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#c9d1d9]">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#c9d1d9]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#c9d1d9]">
              Industry
            </label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. FinServ, E-commerce"
              className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || nodes.length === 0}
            className="flex items-center gap-2 rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#388bfd] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LayoutTemplate className="h-4 w-4" />
            )}
            Save Template
          </button>
        </div>
      </div>
    </>
  );
}
