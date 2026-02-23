import type { Node, Edge } from "@xyflow/react";
import type { NodeType } from "./nodes";

/** Pipeline deployment status */
export enum PipelineStatus {
  Draft = "draft",
  Deployed = "deployed",
  Paused = "paused",
  Archived = "archived",
}

/** Node configuration stored on each pipeline node */
export interface NodeConfig {
  [key: string]: unknown;
}

/** Pipeline node extending React Flow node with nodeType and config */
export interface PipelineNode extends Node {
  type: "custom";
  data: {
    type: NodeType;
    label?: string;
    config?: NodeConfig;
    configSummary?: string;
    hasError?: boolean;
  };
}

/** Edge validation status */
export type EdgeValidationStatus = "valid" | "invalid" | "unknown";

/** Pipeline edge extending React Flow edge with validation */
export interface PipelineEdge extends Edge {
  data?: {
    validationStatus?: EdgeValidationStatus;
    validationMessage?: string;
  };
}

/** Pipeline metadata (version, author, etc.) */
export interface PipelineMetadata {
  version?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

/** Full pipeline definition - the serializable pipeline document */
export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  metadata?: PipelineMetadata;
  status?: PipelineStatus;
}
