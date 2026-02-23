"use client";

import { useState } from "react";
import * as LucideIcons from "lucide-react";
import PipelineCanvas from "@/components/canvas/PipelineCanvas";
import NodePalette from "@/components/canvas/NodePalette";
import ConfigPanel from "@/components/panels/ConfigPanel";
import HelpPanel from "@/components/panels/HelpPanel";
import CodePreview from "@/components/editors/CodePreview";
import TemplateGallery from "@/components/templates/TemplateGallery";
import Toast from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { computeLayout } from "@/lib/autoLayout";

export default function Home() {
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [codePreviewCollapsed, setCodePreviewCollapsed] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const {
    pipelineName,
    selectedNodeId,
    isDirty,
    nodes,
    edges,
    isSaving,
    isDeploying,
    savePipeline,
    deployPipeline,
    validatePipeline,
    pipelineId,
    onNodesChange,
  } = usePipelineStore();
  const addToast = useToastStore((s) => s.addToast);

  async function handleSave() {
    try {
      await savePipeline();
      addToast("Pipeline saved successfully", "success");
    } catch {
      addToast("Failed to save pipeline", "error");
    }
  };

  const handleDeploy = async () => {
    const validation = validatePipeline();
    if (!validation.valid) {
      addToast(validation.errors.join(". "), "error");
      return;
    }
    try {
      let id = pipelineId;
      if (!id) {
        await savePipeline();
        id = usePipelineStore.getState().pipelineId;
      }
      if (!id) {
        addToast("Failed to get pipeline ID after save", "error");
        return;
      }
      await deployPipeline({
        pipeline_id: id,
        job_name: pipelineName.replace(/\s+/g, "-") || "default-job",
      });
      addToast("Pipeline deployed successfully", "success");
    } catch {
      addToast("Deployment failed", "error");
    }
  }

  useKeyboardShortcuts({
    onSave: handleSave,
    onGenerateCode: () => usePipelineStore.getState().triggerCodeGen(),
    onDeploy: handleDeploy,
  });

  const isEmpty = nodes.length === 0;

  const handleAutoLayout = () => {
    const laidOut = computeLayout(nodes, edges);
    onNodesChange(laidOut);
    addToast("Layout applied", "success");
  };

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
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-60"
            onClick={handleAutoLayout}
            disabled={nodes.length === 0}
            title="Auto-arrange pipeline nodes"
          >
            <LucideIcons.Network className="h-4 w-4" />
            Auto Layout
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200"
            onClick={() => setTemplatesOpen(true)}
          >
            <LucideIcons.LayoutTemplate className="h-4 w-4" />
            Templates
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-60"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <LucideIcons.Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LucideIcons.Save className="h-4 w-4" />
            )}
            Save
          </button>
          <button
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={handleDeploy}
            disabled={isDeploying}
          >
            {isDeploying ? (
              <LucideIcons.Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LucideIcons.Rocket className="h-4 w-4" />
            )}
            Deploy
          </button>
          <button
            onClick={() => setHelpOpen((o) => !o)}
            className={cn(
              "rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              helpOpen && "bg-slate-800 text-slate-200"
            )}
            title="Help"
          >
            <LucideIcons.HelpCircle className="h-5 w-5" />
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
        <main className="relative flex-1 min-w-0">
          <PipelineCanvas />
          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/80 px-8 py-6 text-center backdrop-blur">
                <LucideIcons.Boxes className="mx-auto mb-3 h-12 w-12 text-slate-500" />
                <p className="text-sm font-medium text-slate-300">
                  Drag nodes from the palette to start building your pipeline
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add sources, transforms, CEP patterns, and sinks
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar: Config Panel */}
        <ConfigPanel isOpen={!!selectedNodeId} />
        {/* Help Panel */}
        <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>

      {/* Bottom panel: Code Preview */}
      <CodePreview
        collapsed={codePreviewCollapsed}
        onToggleCollapse={() => setCodePreviewCollapsed(!codePreviewCollapsed)}
      />

      {/* Toast notifications */}
      <Toast />

      {/* Templates modal */}
      {templatesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[80vh] max-h-[700px] w-full max-w-4xl">
            <TemplateGallery onClose={() => setTemplatesOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
