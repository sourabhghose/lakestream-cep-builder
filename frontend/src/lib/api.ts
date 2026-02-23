import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const api = axios.create({ baseURL: API_BASE });

export async function generateCode(pipeline: {
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
}) {
  const res = await api.post("/api/codegen/generate", {
    id: "temp",
    name: pipeline.name,
    description: pipeline.description,
    nodes: pipeline.nodes.map((n) => ({
      id: n.id,
      type: n.data?.type || n.type,
      position: n.position,
      config: n.data?.config || {},
      label: n.data?.label || n.id,
    })),
    edges: pipeline.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    })),
  });
  return res.data; // { sdp_code, sss_code, code_target, warnings }
}

export async function parseCode(code: string): Promise<{
  nodes: { id: string; type: string; position?: { x: number; y: number }; config?: Record<string, unknown>; label?: string }[];
  edges: { id: string; source: string; target: string }[];
  warnings: string[];
}> {
  const res = await api.post("/api/codeparse/parse", { code });
  return res.data;
}

export async function savePipeline(pipeline: any) {
  const res = await api.post("/api/pipelines", pipeline);
  return res.data;
}

export async function deployPipeline(request: {
  pipeline_id: string;
  job_name: string;
  cluster_config?: any;
}) {
  const res = await api.post("/api/deploy", request);
  return res.data;
}

export default api;
