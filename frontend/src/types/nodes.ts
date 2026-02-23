// Node categories
export type NodeCategory = "source" | "cep-pattern" | "transform" | "sink";

// Code generation target
export type CodeTarget = "sdp" | "sss" | "sdp-or-sss";

// Every node type as a union
export type NodeType =
  // Sources (8)
  | "kafka-topic"
  | "delta-table-source"
  | "auto-loader"
  | "rest-webhook-source"
  | "cdc-stream"
  | "event-hub-kinesis"
  | "mqtt"
  | "custom-python-source"
  // CEP Patterns (12)
  | "sequence-detector"
  | "absence-detector"
  | "count-threshold"
  | "velocity-detector"
  | "geofence-location"
  | "temporal-correlation"
  | "trend-detector"
  | "outlier-anomaly"
  | "session-detector"
  | "deduplication"
  | "match-recognize-sql"
  | "custom-stateful-processor"
  // Transforms (10)
  | "filter"
  | "map-select"
  | "flatten-explode"
  | "lookup-enrichment"
  | "window-aggregate"
  | "stream-stream-join"
  | "stream-static-join"
  | "union-merge"
  | "rename-cast"
  | "custom-python-udf"
  // Sinks (8)
  | "delta-table-sink"
  | "kafka-topic-sink"
  | "rest-webhook-sink"
  | "slack-teams-pagerduty"
  | "email-sink"
  | "sql-warehouse-sink"
  | "unity-catalog-table-sink"
  | "dead-letter-queue";

// Config field types for dynamic form rendering
export type ConfigFieldType =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "toggle"
  | "code"
  | "schema-picker"
  | "duration"
  | "key-value"
  | "column-picker"
  | "expression";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
  validation?: { min?: number; max?: number; pattern?: string };
  /** Show only when another field has a specific value (or any of values) */
  dependsOn?: { field: string; value?: unknown; values?: unknown[] };
  group?: string;
  /** For code/schema-picker: editor language (python, sql, json) */
  codeLanguage?: "python" | "sql" | "json";
}

export interface NodeDefinition {
  type: NodeType;
  label: string;
  description: string;
  category: NodeCategory;
  codeTarget: CodeTarget;
  icon: string;
  color: string;
  inputs: number;
  outputs: number;
  configFields: ConfigField[];
  advancedFields?: ConfigField[];
}
