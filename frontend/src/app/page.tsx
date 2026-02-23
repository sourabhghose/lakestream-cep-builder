"use client";

import { useState, useRef, useEffect } from "react";
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
  Boxes,
  History,
  ShieldCheck,
  Sun,
  Moon,
  Group,
  GitBranch,
  Workflow,
  Play,
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
import JobStatusNotification from "@/components/notifications/JobStatusNotification";
import Toast from "@/components/ui/Toast";
import { SkipLink } from "@/components/ui/SkipLink";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorFallback } from "@/components/ui/ErrorFallback";
import { useJobStatusStore } from "@/hooks/useJobStatusStore";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";
import { useThemeStore } from "@/hooks/useThemeStore";
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
  const [codePreviewCollapsed, setCodePreviewCollapsed] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
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
  const { theme, toggleTheme, initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

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

  const isEmpty = nodes.length === 0;
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
    <div className="flex h-screen flex-col bg-gray-100 dark:bg-slate-950">
      <SkipLink href="#main-canvas">Skip to canvas</SkipLink>
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-200">
            LakeStream CEP Builder
          </h1>
          <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex items-center gap-2 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-label="Pipeline menu"
              >
                <Menu className="h-4 w-4" />
                <span className="max-w-[180px] truncate">{pipelineName}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
                align="start"
                sideOffset={4}
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
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
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
                  onSelect={() => {
                    setPipelineListOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Open
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
                  onSelect={() => {
                    setSaveDialogOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Save className="h-4 w-4" />
                  Save
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
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
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
                  onSelect={() => {
                    setVersionDiffOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <GitBranch className="h-4 w-4" />
                  Version History
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
                  onSelect={() => {
                    setSaveTemplateDialogOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Save as Template
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
                  onSelect={handleExportPipeline}
                >
                  <Download className="h-4 w-4" />
                  Export Pipeline
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none hover:bg-slate-800"
                  onSelect={handleImportPipelineClick}
                >
                  <Upload className="h-4 w-4" />
                  Import Pipeline
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-slate-700" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-red-400 outline-none hover:bg-slate-800"
                  onSelect={handleDeletePipeline}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <span className="text-xs text-slate-500">
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
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-60"
            onClick={handleGroupClick}
            disabled={selectedCount < 2}
            title="Group selected nodes"
            aria-label="Group selected nodes"
          >
            <Group className="h-4 w-4" />
            Group
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-60"
            onClick={handleAutoLayout}
            disabled={nodes.length === 0}
            title="Auto-arrange pipeline nodes"
            aria-label="Auto-arrange pipeline nodes"
          >
            <Network className="h-4 w-4" />
            Auto Layout
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200"
            onClick={() => setTemplatesOpen(true)}
            aria-label="Open templates gallery"
          >
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-60"
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
              "rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              deployHistoryOpen && "bg-slate-800 text-slate-200"
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
              "rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              flowPreviewOpen && "bg-slate-800 text-slate-200"
            )}
            onClick={() => setFlowPreviewOpen((o) => !o)}
            title="Flow Preview"
            aria-label="Flow preview"
            aria-pressed={flowPreviewOpen}
          >
            <Workflow className="h-5 w-5" />
          </button>
          <button
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-200"
            onClick={() => setValidationPanelOpen(true)}
            title="Validate pipeline"
            aria-label="Validate pipeline"
          >
            <ShieldCheck className="h-4 w-4" />
            Validate
          </button>
          <button
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={handleDeployClick}
            aria-label="Deploy pipeline"
          >
            <Rocket className="h-4 w-4" />
            Deploy
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setHelpOpen((o) => !o)}
            className={cn(
              "rounded-md p-2 text-gray-600 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
              helpOpen && "bg-gray-200 text-gray-900 dark:bg-slate-800 dark:text-slate-200"
            )}
            title="Help"
            aria-label="Help"
            aria-pressed={helpOpen}
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: Node Palette */}
        <nav role="navigation" aria-label="Node palette">
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
          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-dashed border-gray-300 bg-white/80 px-8 py-6 text-center backdrop-blur dark:border-slate-600 dark:bg-slate-900/80">
                <Boxes className="mx-auto mb-3 h-12 w-12 text-gray-500 dark:text-slate-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  Drag nodes from the palette to start building your pipeline
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">
                  Add sources, transforms, CEP patterns, and sinks
                </p>
              </div>
            </div>
          )}
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
