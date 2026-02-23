"use client";

import { useState } from "react";
import * as LucideIcons from "lucide-react";
import PipelineCanvas from "@/components/canvas/PipelineCanvas";
import NodePalette from "@/components/canvas/NodePalette";
import ConfigPanel from "@/components/panels/ConfigPanel";
import CodePreview from "@/components/editors/CodePreview";
import { usePipelineStore } from "@/hooks/usePipelineStore";

export default function Home() {
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [codePreviewCollapsed, setCodePreviewCollapsed] = useState(false);
  const { pipelineName, selectedNodeId, isDirty } = usePipelineStore();

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-700 bg-slate-900/95 px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-200">
            LakeStream CEP Builder
          </h1>
          <input
            type="text"
            value={pipelineName}
            onChange={(e) =>
              usePipelineStore.getState().setPipelineName(e.target.value)
            }
            className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Pipeline name"
          />
          {isDirty && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200"
            onClick={() => {}}
          >
            <LucideIcons.Save className="h-4 w-4" />
            Save
          </button>
          <button
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => {}}
          >
            <LucideIcons.Rocket className="h-4 w-4" />
            Deploy
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: Node Palette */}
        <NodePalette
          collapsed={paletteCollapsed}
          onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)}
        />

        {/* Center: Canvas */}
        <main className="flex-1 min-w-0">
          <PipelineCanvas />
        </main>

        {/* Right sidebar: Config Panel */}
        <ConfigPanel isOpen={!!selectedNodeId} />
      </div>

      {/* Bottom panel: Code Preview */}
      <CodePreview
        collapsed={codePreviewCollapsed}
        onToggleCollapse={() => setCodePreviewCollapsed(!codePreviewCollapsed)}
      />
    </div>
  );
}
