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
          "max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
          <h2 className="text-lg font-semibold text-[#e8eaed]">Help</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4 text-sm text-[#c9d1d9]">
          <div>
            <h3 className="mb-2 font-medium text-[#e8eaed]">Getting Started</h3>
            <p>Drag nodes from the palette onto the canvas to build your pipeline.</p>
            <p className="mt-1">Connect nodes by dragging from output handles to input handles.</p>
            <p className="mt-1">Click a node to configure it in the right panel.</p>
            <p className="mt-1">Use Auto Layout to automatically arrange nodes left-to-right.</p>
          </div>
          <div>
            <h3 className="mb-2 font-medium text-[#e8eaed]">Keyboard Shortcuts</h3>
            <ul className="space-y-1.5">
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+C</kbd> Copy selected nodes</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+V</kbd> Paste clipboard</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+D</kbd> Duplicate selected nodes</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+A</kbd> Select all nodes</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+S</kbd> Save pipeline</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+Shift+G</kbd> Generate code</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+Shift+D</kbd> Deploy pipeline</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+Z</kbd> Undo</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl+Shift+Z</kbd> Redo</li>
              <li><kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">Delete</kbd> / <kbd className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-xs">Backspace</kbd> Delete selected</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
