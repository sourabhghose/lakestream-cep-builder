import axios, { type AxiosError } from "axios";

// Production (Databricks App): same origin, baseURL "". Dev: set NEXT_PUBLIC_API_URL=http://localhost:8000
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const api = axios.create({ baseURL: API_BASE });

/** Augmented error with user-friendly message for UI display */
export interface ApiErrorWithMessage extends Error {
  userMessage?: string;
}

// Response interceptor: enhance errors with userMessage, do not suppress
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    let userMessage: string;
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data as Record<string, unknown> | string | null;
      if (status === 401) userMessage = "Authentication required";
      else if (status === 403) userMessage = "Permission denied";
      else if (status === 404) userMessage = "Resource not found";
      else if (status >= 500) {
        const d = data as Record<string, unknown> | null;
        if (d && typeof d.detail === "string") userMessage = d.detail;
        else userMessage = "Server error. Please try again later.";
      }
      else if (data) {
        if (typeof data === "string") userMessage = data;
        else if (typeof data.message === "string") userMessage = data.message;
        else if (data.detail) {
          const detail = data.detail;
          userMessage =
            typeof detail === "string"
              ? detail
              : Array.isArray(detail)
                ? detail.map((d: any) => d?.msg ?? String(d)).join("; ")
                : "Request failed";
        } else userMessage = "Request failed";
      } else userMessage = "Request failed";
    } else {
      const code = err.code;
      userMessage =
        code === "ECONNABORTED" ||
        code === "ERR_NETWORK" ||
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "ETIMEDOUT"
          ? "Cannot connect to backend. Is the server running?"
          : err.message || "Request failed";
    }
    (err as ApiErrorWithMessage).userMessage = userMessage;
    return Promise.reject(err);
  }
);

/** Map React Flow nodes to API format */
function nodesToApi(nodes: { id: string; type?: string; position?: { x: number; y: number }; data?: { type?: string; config?: Record<string, unknown>; label?: string } }[]) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.data?.type || n.type || "map-select",
    position: n.position ?? { x: 0, y: 0 },
    config: n.data?.config ?? {},
    label: n.data?.label ?? n.id,
  }));
}

/** Map React Flow edges to API format */
function edgesToApi(edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[]) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
}

export interface PipelineSummary {
  id: string;
  name: string;
  description: string;
  updated_at: string;
  node_count: number;
  edge_count: number;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  nodes: { id: string; type: string; position: { x: number; y: number }; config: Record<string, unknown>; label: string | null }[];
  edges: { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null }[];
  created_at: string;
  updated_at: string;
  version: number;
  status: string;
}

export interface CodeAnnotation {
  node_id: string;
  node_label: string;
  start_line: number;
  end_line: number;
}

export interface GenerateCodeResponse {
  sdp_code?: string | null;
  sss_code?: string | null;
  code_target?: "sdp" | "sss" | "hybrid";
  warnings?: string[];
  sdp_annotations?: CodeAnnotation[];
  sss_annotations?: CodeAnnotation[];
}

export async function generateCode(pipeline: {
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
}): Promise<GenerateCodeResponse> {
  const res = await api.post("/api/codegen/generate", {
    id: "temp",
    name: pipeline.name,
    description: pipeline.description,
    nodes: nodesToApi(pipeline.nodes),
    edges: edgesToApi(pipeline.edges),
  });
  return res.data;
}

export async function parseCode(code: string): Promise<{
  nodes: { id: string; type: string; position?: { x: number; y: number }; config?: Record<string, unknown>; label?: string }[];
  edges: { id: string; source: string; target: string }[];
  warnings: string[];
}> {
  const res = await api.post("/api/codeparse/parse", { code });
  return res.data;
}

export async function listPipelines(): Promise<PipelineSummary[]> {
  const res = await api.get("/api/pipelines");
  return res.data;
}

export async function getPipeline(id: string): Promise<PipelineDefinition> {
  const res = await api.get(`/api/pipelines/${id}`);
  return res.data;
}

export async function createPipeline(data: {
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
}): Promise<PipelineDefinition> {
  const res = await api.post("/api/pipelines", {
    name: data.name,
    description: data.description,
    nodes: nodesToApi(data.nodes),
    edges: edgesToApi(data.edges),
  });
  return res.data;
}

export async function updatePipeline(
  id: string,
  data: { name?: string; description?: string; nodes?: any[]; edges?: any[] }
): Promise<PipelineDefinition> {
  const payload: Record<string, unknown> = {};
  if (data.name != null) payload.name = data.name;
  if (data.description != null) payload.description = data.description;
  if (data.nodes != null) payload.nodes = nodesToApi(data.nodes);
  if (data.edges != null) payload.edges = edgesToApi(data.edges);
  const res = await api.put(`/api/pipelines/${id}`, payload);
  return res.data;
}

export async function deletePipeline(id: string): Promise<void> {
  await api.delete(`/api/pipelines/${id}`);
}

export async function savePipeline(pipeline: {
  id?: string | null;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
}): Promise<{ id: string }> {
  const nodes = nodesToApi(pipeline.nodes);
  const edges = edgesToApi(pipeline.edges);
  if (pipeline.id) {
    const res = await api.put(`/api/pipelines/${pipeline.id}`, {
      name: pipeline.name,
      description: pipeline.description,
      nodes,
      edges,
    });
    return { id: res.data.id };
  }
  const res = await api.post("/api/pipelines", {
    name: pipeline.name,
    description: pipeline.description,
    nodes,
    edges,
  });
  return { id: res.data.id };
}

export interface DeployRequest {
  pipeline_id: string;
  job_name: string;
  cluster_config?: Record<string, unknown>;
  code_target?: "sdp" | "sss" | "hybrid";
  schedule?: string;
  max_retries?: number;
  checkpoint_location?: string;
  catalog?: string;
  target_schema?: string;
}

export interface DeployResponse {
  job_id: string;
  job_url: string;
  status: string;
  deployment_type?: string;
}

export async function deployPipeline(request: DeployRequest): Promise<DeployResponse> {
  const res = await api.post("/api/deploy", request);
  return res.data;
}

export interface ValidateConnectionResponse {
  success: boolean;
  message: string;
  mode?: string;
}

export async function validateDeployConnection(): Promise<ValidateConnectionResponse> {
  const res = await api.get("/api/deploy/validate");
  return res.data;
}

export interface DeployHistoryEntry {
  id: string;
  pipeline_id: string;
  pipeline_version: number;
  code_target: string;
  databricks_job_id: string | null;
  databricks_pipeline_id: string | null;
  job_url: string | null;
  deploy_status: string;
  deployed_code: string | null;
  cluster_config: Record<string, unknown> | null;
  deployed_by: string | null;
  deployed_at: string;
  error_message: string | null;
}

export async function getDeployHistory(
  pipelineId: string
): Promise<DeployHistoryEntry[]> {
  const res = await api.get(
    `/api/deploy/history/${encodeURIComponent(pipelineId)}/details`
  );
  return res.data ?? [];
}

/** Returns the most recent deploy record for a pipeline, optionally filtered by code_target. */
export async function getLatestDeploy(
  pipelineId: string,
  codeTarget?: "sdp" | "sss"
): Promise<DeployHistoryEntry | null> {
  const history = await getDeployHistory(pipelineId);
  if (history.length === 0) return null;
  if (codeTarget) {
    const match = history.find(
      (e) => e.code_target?.toLowerCase() === codeTarget
    );
    return match ?? null;
  }
  return history[0];
}

export interface PreviewSampleResponse {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  row_count: number;
}

export async function getNodePreview(
  pipeline: { nodes: any[]; edges: any[] },
  nodeId: string,
  seed?: number
): Promise<PreviewSampleResponse> {
  const res = await api.post("/api/preview/sample", {
    pipeline: {
      nodes: nodesToApi(pipeline.nodes),
      edges: edgesToApi(pipeline.edges),
    },
    node_id: nodeId,
    seed: seed ?? null,
  });
  return res.data;
}

// Schema discovery (Unity Catalog)
export interface CatalogInfo {
  name: string;
  comment?: string;
}

export interface SchemaInfo {
  name: string;
  comment?: string;
}

export interface TableInfo {
  name: string;
  table_type: string;
  columns?: { name: string; type: string; nullable: boolean }[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export async function listCatalogs(): Promise<CatalogInfo[]> {
  const res = await api.get("/api/schema/catalogs");
  return res.data ?? [];
}

export async function listSchemas(catalog: string): Promise<SchemaInfo[]> {
  const res = await api.get(`/api/schema/catalogs/${encodeURIComponent(catalog)}/schemas`);
  return res.data ?? [];
}

export async function listTables(
  catalog: string,
  schema: string
): Promise<TableInfo[]> {
  const res = await api.get(
    `/api/schema/catalogs/${encodeURIComponent(catalog)}/schemas/${encodeURIComponent(schema)}/tables`
  );
  return res.data ?? [];
}

export async function listColumns(
  catalog: string,
  schema: string,
  table: string
): Promise<ColumnInfo[]> {
  const res = await api.get(
    `/api/schema/catalogs/${encodeURIComponent(catalog)}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`
  );
  return res.data ?? [];
}

// Templates
export interface TemplateResponse {
  id: string;
  name: string;
  description: string;
  industry: string;
  canvas_json: { nodes: unknown[]; edges: unknown[] };
  is_builtin: boolean;
  created_by: string | null;
  created_at: string | null;
}

export interface TemplateCreateData {
  name: string;
  description?: string;
  industry?: string;
  canvas_json: { nodes: unknown[]; edges: unknown[] };
}

export async function listTemplates(): Promise<TemplateResponse[]> {
  const res = await api.get("/api/templates");
  return res.data ?? [];
}

export async function createTemplate(data: TemplateCreateData): Promise<TemplateResponse> {
  const res = await api.post("/api/templates", {
    name: data.name,
    description: data.description ?? "",
    industry: data.industry ?? "",
    canvas_json: data.canvas_json,
  });
  return res.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/api/templates/${encodeURIComponent(id)}`);
}

// Flow preview
export interface FlowPreviewResponse {
  node_previews: Record<string, { columns: string[]; rows: (string | number | boolean | null)[][] }>;
}

export async function getFlowPreview(pipeline: {
  nodes: any[];
  edges: any[];
}): Promise<FlowPreviewResponse> {
  const res = await api.post("/api/preview/flow", {
    nodes: nodesToApi(pipeline.nodes),
    edges: edgesToApi(pipeline.edges),
  });
  return res.data;
}

// Pipeline versions
export interface PipelineVersionSnapshot {
  version: number;
  saved_at: string;
  canvas_json: { nodes: unknown[]; edges: unknown[] };
  name: string;
}

export async function getPipelineVersions(
  pipelineId: string
): Promise<PipelineVersionSnapshot[]> {
  const res = await api.get(`/api/pipelines/${encodeURIComponent(pipelineId)}/versions`);
  return res.data ?? [];
}

// Job status
export interface JobStatusResponse {
  job_id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  run_url?: string;
  start_time?: string;
  duration_ms?: number;
}

export interface ActiveJobResponse {
  job_id: string;
  pipeline_id: string;
  pipeline_name: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  job_url?: string;
  start_time?: string;
  duration_ms?: number;
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await api.get(`/api/jobs/${encodeURIComponent(jobId)}/status`);
  return res.data;
}

export async function getActiveJobs(): Promise<ActiveJobResponse[]> {
  const res = await api.get("/api/jobs/active");
  return res.data ?? [];
}

// Pattern test
export interface PatternTestMatch {
  pattern_node_id: string;
  pattern_name: string;
  matched_events: number[];
  match_time: string;
  details: string;
}

export interface PatternTestEventFlow {
  event_index: number;
  reached_nodes: string[];
}

export interface PatternTestResponse {
  matches: PatternTestMatch[];
  event_flow: PatternTestEventFlow[];
  total_events: number;
  total_matches: number;
}

export async function testPattern(
  pipeline: { nodes: any[]; edges: any[] },
  events: Record<string, unknown>[]
): Promise<PatternTestResponse> {
  const res = await api.post("/api/pattern/test", {
    pipeline: {
      nodes: nodesToApi(pipeline.nodes),
      edges: edgesToApi(pipeline.edges),
    },
    events,
  });
  return res.data;
}

// --- AI Pipeline Generation ---

export interface AIGenerateRequest {
  prompt: string;
}

export interface AIGenerateResponse {
  name: string;
  description: string;
  nodes: { id: string; type: string; x: number; y: number; label: string; config: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
}

export async function aiGeneratePipeline(prompt: string): Promise<AIGenerateResponse> {
  const res = await api.post("/api/ai/generate", { prompt });
  return res.data;
}

// --- AI Config Assist ---

export interface AIConfigAssistResponse {
  config: Record<string, unknown>;
}

export async function aiConfigAssist(nodeType: string, description: string): Promise<AIConfigAssistResponse> {
  const res = await api.post("/api/ai/config-assist", { node_type: nodeType, description });
  return res.data;
}

// --- AI Code Explanation ---

export interface AICodeExplainResponse {
  explanation: string;
}

export async function aiExplainCode(code: string, codeTarget: string = "sdp"): Promise<AICodeExplainResponse> {
  const res = await api.post("/api/ai/explain-code", { code, code_target: codeTarget });
  return res.data;
}

// --- AI Smart Validation ---

export interface SmartValidateSuggestion {
  category: string;
  severity: string;
  node_id: string | null;
  title: string;
  description: string;
}

export interface AISmartValidateResponse {
  summary: string;
  score: number;
  suggestions: SmartValidateSuggestion[];
}

export async function aiSmartValidate(
  pipeline: { nodes: any[]; edges: any[] },
  pipelineName: string = ""
): Promise<AISmartValidateResponse> {
  const res = await api.post("/api/ai/smart-validate", {
    nodes: nodesToApi(pipeline.nodes),
    edges: edgesToApi(pipeline.edges),
    pipeline_name: pipelineName,
  });
  return res.data;
}

export default api;