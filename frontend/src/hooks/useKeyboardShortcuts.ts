"use client";

import { useEffect, useCallback } from "react";
import { usePipelineStore } from "./usePipelineStore";

export interface UseKeyboardShortcutsOptions {
  onSave?: () => void | Promise<void>;
  onGenerateCode?: () => void;
  onDeploy?: () => void | Promise<void>;
  enabled?: boolean;
}

/**
 * Registers global keyboard shortcuts for the pipeline builder.
 * Wire up in page.tsx with handlers for save, generate, deploy.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const {
    onSave,
    onGenerateCode,
    onDeploy,
    enabled = true,
  } = options;

  const {
    savePipeline,
    triggerCodeGen,
    deployPipeline,
    validatePipeline,
    pipelineId,
    pipelineName,
    deleteSelected,
    undo,
    redo,
    undoStack,
    redoStack,
  } = usePipelineStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const isMac = typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("mac");
      const mod = isMac ? "metaKey" : "ctrlKey";

      // Cmd/Ctrl+S — Save pipeline
      if (e[mod] && e.key === "s") {
        e.preventDefault();
        if (onSave) {
          onSave();
        } else {
          savePipeline();
        }
        return;
      }

      // Cmd/Ctrl+Shift+G — Generate code
      if (e[mod] && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (onGenerateCode) {
          onGenerateCode();
        } else {
          triggerCodeGen();
        }
        return;
      }

      // Cmd/Ctrl+Shift+D — Deploy pipeline
      if (e[mod] && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (onDeploy) {
          onDeploy();
        } else {
          const validation = validatePipeline();
          if (!validation.valid) return;
          let id = pipelineId;
          if (!id) {
            savePipeline().then(() => {
              const nextId = usePipelineStore.getState().pipelineId;
              if (nextId) {
                deployPipeline({
                  pipeline_id: nextId,
                  job_name: pipelineName.replace(/\s+/g, "-") || "default-job",
                });
              }
            });
          } else {
            deployPipeline({
              pipeline_id: id,
              job_name: pipelineName.replace(/\s+/g, "-") || "default-job",
            });
          }
        }
        return;
      }

      // Delete/Backspace — Delete selected nodes/edges
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;
        if (isInput) return;

        e.preventDefault();
        deleteSelected();
        return;
      }

      // Cmd/Ctrl+Z — Undo
      if (e[mod] && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (undoStack.length > 0) {
          undo();
        }
        return;
      }

      // Cmd/Ctrl+Shift+Z — Redo
      if (e[mod] && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (redoStack.length > 0) {
          redo();
        }
        return;
      }
    },
    [
      enabled,
      onSave,
      onGenerateCode,
      onDeploy,
      savePipeline,
      triggerCodeGen,
      deployPipeline,
      validatePipeline,
      pipelineId,
      pipelineName,
      deleteSelected,
      undo,
      redo,
      undoStack.length,
      redoStack.length,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
