import axios from "axios";

// Production (Databricks App): same origin, baseURL "". Dev: set NEXT_PUBLIC_API_URL=http://localhost:8000
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const api = axios.create({ baseURL: API_BASE });

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
  code_target?: "sdp" | "sss";
  schedule?: string;
  max_retries?: number;
  checkpoint_location?: string;
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
  nodeId: string
): Promise<PreviewSampleResponse> {
  const res = await api.post("/api/preview/sample", {
    pipeline: {
      nodes: nodesToApi(pipeline.nodes),
      edges: edgesToApi(pipeline.edges),
    },
    node_id: nodeId,
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

export default api;
