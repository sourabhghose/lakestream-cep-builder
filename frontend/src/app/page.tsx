"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Menu,
  ChevronDown,
  FilePlus,
  FolderOpen,
  Save,
  Copy,
  Trash2,
  Download,
  Upload,
  Network,
  LayoutTemplate,
  Loader2,
  Rocket,
  HelpCircle,
  History,
  ShieldCheck,
  Group,
  GitBranch,
  Workflow,
  Play,
  Sparkles,
  Eraser,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import PipelineCanvas from "@/components/canvas/PipelineCanvas";
import NodePalette from "@/components/canvas/NodePalette";
import ConfigPanel from "@/components/panels/ConfigPanel";
import HelpPanel from "@/components/panels/HelpPanel";
import PipelineListPanel from "@/components/panels/PipelineListPanel";
import DeployHistoryPanel from "@/components/panels/DeployHistoryPanel";
import VersionDiffPanel from "@/components/panels/VersionDiffPanel";
import ValidationPanel from "@/components/panels/ValidationPanel";
import FlowPreviewPanel from "@/components/preview/FlowPreviewPanel";
import PatternTestPanel from "@/components/test/PatternTestPanel";
import CodePreview from "@/components/editors/CodePreview";
import TemplateGallery from "@/components/templates/TemplateGallery";
import SaveDialog from "@/components/dialogs/SaveDialog";
import SaveTemplateDialog from "@/components/dialogs/SaveTemplateDialog";
import DeployDialog from "@/components/dialogs/DeployDialog";
import AIAssistDialog from "@/components/dialogs/AIAssistDialog";
import JobStatusNotification from "@/components/notifications/JobStatusNotification";
import Toast from "@/components/ui/Toast";
import { SkipLink } from "@/components/ui/SkipLink";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorFallback } from "@/components/ui/ErrorFallback";
import { useJobStatusStore } from "@/hooks/useJobStatusStore";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";
// Theme is dark-only; no toggle needed
import { exportPipeline, importPipeline } from "@/lib/pipelineIO";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { computeLayout } from "@/lib/autoLayout";
import * as api from "@/lib/api";

function formatLastSaved(iso: string | null): string {
  if (!iso) return "Never saved";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Home() {
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [codePreviewCollapsed, setCodePreviewCollapsed] = useState(true);
  const [codeDockHeight, setCodeDockHeight] = useState(48);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pipelineListOpen, setPipelineListOpen] = useState(false);
  const [deployHistoryOpen, setDeployHistoryOpen] = useState(false);
  const [versionDiffOpen, setVersionDiffOpen] = useState(false);
  const [validationPanelOpen, setValidationPanelOpen] = useState(false);
  const [flowPreviewOpen, setFlowPreviewOpen] = useState(false);
  const [patternTestOpen, setPatternTestOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    pipelineName,
    selectedNodeId,
    isDirty,
    nodes,
    edges,
    isSaving,
    savePipeline,
    pipelineId,
    lastSavedAt,
    pipelineVersion,
    resetPipeline,
    loadPipeline,
    loadPipelineFromServer,
    onNodesChange,
    createGroup,
  } = usePipelineStore();
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);
  const toasts = useToastStore((s) => s.toasts);
  const activeJobs = useJobStatusStore((s) => s.activeJobs);
  const generatedSdpCode = usePipelineStore((s) => s.generatedSdpCode);
  const generatedSssCode = usePipelineStore((s) => s.generatedSssCode);

  useEffect(() => {
    if (generatedSdpCode || generatedSssCode) {
      setCodePreviewCollapsed(false);
    }
  }, [generatedSdpCode, generatedSssCode]);

  function handleSaveClick() {
    setSaveDialogOpen(true);
  }

  async function handleDeletePipeline() {
    if (!pipelineId) {
      resetPipeline();
      addToast("Pipeline cleared", "success");
      setMenuOpen(false);
      return;
    }
    try {
      await api.deletePipeline(pipelineId);
      resetPipeline();
      addToast("Pipeline deleted", "success");
    } catch {
      addToast("Failed to delete pipeline", "error");
    }
    setMenuOpen(false);
  }

  function handleExportPipeline() {
    exportPipeline();
    setMenuOpen(false);
    addToast("Pipeline exported", "success");
  }

  function handleImportPipelineClick() {
    importFileInputRef.current?.click();
    setMenuOpen(false);
  }

  async function handleImportPipelineFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await importPipeline(file);
      loadPipeline(data.nodes, data.edges, data.name, data.description);
      usePipelineStore.setState({
        pipelineId: null,
        lastSavedAt: null,
        ...(data.metadata?.codeTarget != null && {
          codeTarget: data.metadata.codeTarget as "sdp" | "sss" | "hybrid" | null,
        }),
      });
      addToast(`Pipeline "${data.name}" imported`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to import pipeline", "error");
    }
  }

  function handleDeployClick() {
    setDeployDialogOpen(true);
  }

  useKeyboardShortcuts({
    onSave: handleSaveClick,
    onGenerateCode: () => usePipelineStore.getState().triggerCodeGen(),
    onDeploy: handleDeployClick,
  });

  const selectedCount = nodes.filter(
    (n) => (n as { selected?: boolean }).selected
  ).length;

  const handleGroupClick = () => {
    const name = window.prompt("Enter group name:", "New Group");
    if (name != null && name.trim()) {
      createGroup(name.trim());
      addToast(`Group "${name.trim()}" created`, "success");
    }
  };

  const handleAutoLayout = () => {
    const laidOut = computeLayout(nodes, edges);
    onNodesChange(laidOut);
    addToast("Layout applied", "success");
  };

  return (
    <div className="flex h-screen flex-col bg-[#1b1f23]">
      <SkipLink href="#main-canvas">Skip to canvas</SkipLink>
      {/* Top bar — Databricks-style header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[#e8eaed]">
            LakeStream CEP Builder
          </h1>
          <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex items-center gap-2 rounded border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-sm text-[#e8eaed] hover:bg-[#30363d]"
                aria-label="Pipeline menu"
              >
                <Menu className="h-4 w-4" />
                <span className="max-w-[180px] truncate">{pipelineName}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] rounded-lg border border-[#30363d] bg-[#161b22] py-1 shadow-xl"
                align="start"
                sideOffset={4}
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={() => {
                    resetPipeline();
                    setMenuOpen(false);
                    addToast("New pipeline", "success");
                  }}
                >
                  <FilePlus className="h-4 w-4" />
                  New
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={() => {
                    setPipelineListOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Open
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={() => {
                    setSaveDialogOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Save className="h-4 w-4" />
                  Save
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={() => {
                    usePipelineStore.setState({ pipelineId: null });
                    setSaveDialogOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Save As
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={() => {
                    setVersionDiffOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <GitBranch className="h-4 w-4" />
                  Version History
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={() => {
                    setSaveTemplateDialogOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Save as Template
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={handleExportPipeline}
                >
                  <Download className="h-4 w-4" />
                  Export Pipeline
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[#e8eaed] outline-none hover:bg-[#21262d]"
                  onSelect={handleImportPipelineClick}
                >
                  <Upload className="h-4 w-4" />
                  Import Pipeline
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-[#30363d]" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-red-400 outline-none hover:bg-[#21262d]"
                  onSelect={handleDeletePipeline}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <span className="text-xs text-[#484f58]">
            v{pipelineVersion} · {formatLastSaved(lastSavedAt)}
          </span>
          {isDirty && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" role="toolbar" aria-label="Pipeline actions">
          <button
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed] disabled:opacity-60"
            onClick={handleGroupClick}
            disabled={selectedCount < 2}
            title="Group selected nodes"
            aria-label="Group selected nodes"
          >
            <Group className="h-4 w-4" />
            Group
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed] disabled:opacity-60"
            onClick={handleAutoLayout}
            disabled={nodes.length === 0}
            title="Auto-arrange pipeline nodes"
            aria-label="Auto-arrange pipeline nodes"
          >
            <Network className="h-4 w-4" />
            Auto Layout
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-red-900/30 hover:text-red-400 hover:border-red-500/40 disabled:opacity-60 transition-colors"
            onClick={() => {
              resetPipeline();
              addToast("Canvas cleared", "success");
            }}
            disabled={nodes.length === 0}
            title="Clear all nodes and edges from the canvas"
            aria-label="Clear canvas"
          >
            <Eraser className="h-4 w-4" />
            Clear
          </button>
          <button
            className="flex items-center gap-2 rounded-md bg-gradient-to-r from-purple-600/80 to-blue-600/80 px-4 py-2 text-sm font-medium text-white hover:from-purple-500 hover:to-blue-500 transition-all"
            onClick={() => setAiAssistOpen(true)}
            aria-label="Generate pipeline with AI"
          >
            <Sparkles className="h-4 w-4" />
            AI Assist
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed]"
            onClick={() => setTemplatesOpen(true)}
            aria-label="Open templates gallery"
          >
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed] disabled:opacity-60"
            onClick={handleSaveClick}
            disabled={isSaving}
            aria-label={isSaving ? "Saving pipeline" : "Save pipeline"}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
          <button
            className={cn(
              "rounded-md p-2 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]",
              deployHistoryOpen && "bg-[#30363d] text-[#e8eaed]"
            )}
            onClick={() => setDeployHistoryOpen((o) => !o)}
            title="Deploy History"
            aria-label="Deploy history"
            aria-pressed={deployHistoryOpen}
          >
            <History className="h-5 w-5" />
          </button>
          <button
            className={cn(
              "rounded-md p-2 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]",
              flowPreviewOpen && "bg-[#30363d] text-[#e8eaed]"
            )}
            onClick={() => setFlowPreviewOpen((o) => !o)}
            title="Flow Preview"
            aria-label="Flow preview"
            aria-pressed={flowPreviewOpen}
          >
            <Workflow className="h-5 w-5" />
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed]"
            onClick={() => setValidationPanelOpen(true)}
            title="Validate pipeline"
            aria-label="Validate pipeline"
          >
            <ShieldCheck className="h-4 w-4" />
            Validate
          </button>
          <button
            className="flex items-center gap-2 rounded-md bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
            onClick={handleDeployClick}
            aria-label="Deploy pipeline"
          >
            <Rocket className="h-4 w-4" />
            Deploy
          </button>
          <button
            onClick={() => setHelpOpen((o) => !o)}
            className={cn(
              "rounded-md p-2 text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]",
              helpOpen && "bg-[#30363d] text-[#e8eaed]"
            )}
            title="Help"
            aria-label="Help"
            aria-pressed={helpOpen}
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content — bottom padding reserves space for the fixed code dock */}
      <div className="flex flex-1 min-h-0" style={{ paddingBottom: codeDockHeight }}>
        {/* Left sidebar: Node Palette */}
        <nav role="navigation" aria-label="Node palette" className="h-full overflow-hidden">
        <ErrorBoundary
          fallback={(_, reset) => (
            <ErrorFallback message="Node palette failed to load" onRetry={reset} />
          )}
        >
          <NodePalette
            collapsed={paletteCollapsed}
            onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)}
          />
        </ErrorBoundary>
        </nav>

        {/* Center: Canvas */}
        <main id="main-canvas" className="relative flex-1 min-w-0" tabIndex={-1}>
          <ErrorBoundary>
            <PipelineCanvas />
          </ErrorBoundary>
        </main>

        {/* Right sidebar: Config Panel */}
        <ErrorBoundary
          fallback={(_, reset) => (
            <ErrorFallback message="Config panel failed to load" onRetry={reset} />
          )}
        >
          <ConfigPanel isOpen={!!selectedNodeId} />
        </ErrorBoundary>
        {/* Help Panel */}
        <HelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        {/* Pipeline List Panel */}
        <PipelineListPanel
          isOpen={pipelineListOpen}
          onClose={() => setPipelineListOpen(false)}
        />
        {/* Deploy History Panel */}
        <DeployHistoryPanel
          isOpen={deployHistoryOpen}
          onClose={() => setDeployHistoryOpen(false)}
          pipelineId={pipelineId}
        />
        {/* Version Diff Panel */}
        <VersionDiffPanel
          isOpen={versionDiffOpen}
          onClose={() => setVersionDiffOpen(false)}
        />
        {/* Validation Panel */}
        <ValidationPanel
          isOpen={validationPanelOpen}
          onClose={() => setValidationPanelOpen(false)}
        />
        {/* Flow Preview Panel */}
        <FlowPreviewPanel
          isOpen={flowPreviewOpen}
          onClose={() => setFlowPreviewOpen(false)}
        />
        {/* Pattern Test Panel */}
        <PatternTestPanel
          isOpen={patternTestOpen}
          onClose={() => setPatternTestOpen(false)}
        />
      </div>

      {/* Save Dialog */}
      <SaveDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
      />

      {/* Save as Template Dialog */}
      <SaveTemplateDialog
        isOpen={saveTemplateDialogOpen}
        onClose={() => setSaveTemplateDialogOpen(false)}
      />

      {/* Deploy Dialog */}
      <DeployDialog
        isOpen={deployDialogOpen}
        onClose={() => setDeployDialogOpen(false)}
      />

      {/* Bottom panel: Code Preview */}
      <ErrorBoundary
        fallback={(_, reset) => (
          <ErrorFallback message="Code preview failed to load" onRetry={reset} />
        )}
      >
        <CodePreview
          collapsed={codePreviewCollapsed}
          onToggleCollapse={() => setCodePreviewCollapsed(!codePreviewCollapsed)}
          onHeightChange={setCodeDockHeight}
        />
      </ErrorBoundary>

      {/* Hidden file input for pipeline import */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,.lakestream.json"
        className="hidden"
        onChange={handleImportPipelineFile}
      />

      {/* Notifications area: job status + toasts (bottom-right) */}
      {(Object.keys(activeJobs).length > 0 || toasts.length > 0) && (
        <div className="fixed bottom-20 right-4 z-[100] flex max-w-sm flex-col gap-2">
          {Object.values(activeJobs).map((job) => (
            <JobStatusNotification
              key={job.jobId}
              jobId={job.jobId}
              pipelineName={job.pipelineName}
              jobUrl={job.jobUrl}
            />
          ))}
          <Toast embedded />
        </div>
      )}

      {/* AI Assist Dialog */}
      <AIAssistDialog
        isOpen={aiAssistOpen}
        onClose={() => setAiAssistOpen(false)}
      />

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
