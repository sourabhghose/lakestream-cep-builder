"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className={cn(
          "max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 pb-4">
          <h2 className="text-lg font-semibold text-slate-200">Help</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <p>Drag nodes from the palette onto the canvas to build your pipeline.</p>
          <p>Connect nodes by dragging from output handles to input handles.</p>
          <p>Click a node to configure it in the right panel.</p>
          <p>Use Auto Layout to automatically arrange nodes left-to-right.</p>
        </div>
      </div>
    </div>
  );
}
