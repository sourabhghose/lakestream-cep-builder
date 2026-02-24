"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Save } from "lucide-react";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";

interface SaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SaveDialog({ isOpen, onClose }: SaveDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    pipelineId,
    pipelineName,
    pipelineDescription,
    savePipeline,
    setPipelineName,
    setPipelineDescription,
  } = usePipelineStore();
  const addToast = useToastStore((s) => s.addToast);

  const isNewPipeline = !pipelineId;

  useEffect(() => {
    if (isOpen) {
      setName(pipelineName);
      setDescription(pipelineDescription);
    }
  }, [isOpen, pipelineName, pipelineDescription]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      addToast("Pipeline name is required", "error");
      return;
    }
    setSaving(true);
    try {
      setPipelineName(trimmedName);
      setPipelineDescription(description.trim());
      await savePipeline();
      addToast("Pipeline saved successfully", "success");
      onClose();
    } catch {
      // Toast already shown by usePipelineStore.savePipeline
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
          <h2 className="text-lg font-semibold text-[#e8eaed]">
            {isNewPipeline ? "Save Pipeline" : "Update Pipeline"}
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
              placeholder="Pipeline name"
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
              rows={3}
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
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#388bfd] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </>
  );
}
