import type { Node, Edge } from "@xyflow/react";
import { usePipelineStore } from "@/hooks/usePipelineStore";

const EXPORT_VERSION = "1";

export interface ExportedPipeline {
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  metadata: {
    exportedAt: string;
    version: string;
    codeTarget: string | null;
  };
}

export interface ImportedPipeline {
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: {
    exportedAt?: string;
    version?: string;
    codeTarget?: string | null;
  };
}

/**
 * Exports the current pipeline from the Zustand store as a JSON file.
 * Triggers a browser download as `{pipeline-name}.lakestream.json`.
 */
export function exportPipeline(): void {
  const state = usePipelineStore.getState();
  const { pipelineName, pipelineDescription, codeTarget, getExpandedNodesAndEdges } = state;
  const { nodes, edges } = getExpandedNodesAndEdges();

  const payload: ExportedPipeline = {
    name: pipelineName,
    description: pipelineDescription,
    nodes,
    edges,
    metadata: {
      exportedAt: new Date().toISOString(),
      version: EXPORT_VERSION,
      codeTarget,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = pipelineName.replace(/[^a-zA-Z0-9-_]/g, "_") || "pipeline";
  a.download = `${safeName}.lakestream.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reads a pipeline JSON file, validates it, and returns the parsed pipeline data.
 * @throws Error if the file is invalid or missing required fields.
 */
export async function importPipeline(file: File): Promise<ImportedPipeline> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON: file could not be parsed");
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid pipeline file: root must be an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.nodes)) {
    throw new Error("Invalid pipeline file: missing or invalid 'nodes' array");
  }
  if (!Array.isArray(obj.edges)) {
    throw new Error("Invalid pipeline file: missing or invalid 'edges' array");
  }

  const name = typeof obj.name === "string" ? obj.name : "Imported Pipeline";
  const description = typeof obj.description === "string" ? obj.description : "";

  return {
    name,
    description,
    nodes: obj.nodes as Node[],
    edges: obj.edges as Edge[],
    metadata:
      obj.metadata && typeof obj.metadata === "object"
        ? (obj.metadata as ExportedPipeline["metadata"])
        : undefined,
  };
}
