"use client";

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  Rocket,
  ChevronDown,
  ChevronUp,
  Check,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import { useToastStore } from "@/hooks/useToastStore";
import { useJobStatusStore } from "@/hooks/useJobStatusStore";
import * as api from "@/lib/api";

interface DeployDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CRON_EXAMPLES = [
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly (Sunday 00:00)", value: "0 0 * * 0" },
];

function formatCodeTarget(target: string | null): string {
  if (!target) return "—";
  if (target === "sdp") return "SDP";
  if (target === "sss") return "SSS";
  if (target === "hybrid") return "Hybrid";
  return target;
}

export default function DeployDialog({ isOpen, onClose }: DeployDialogProps) {
  const {
    pipelineId,
    pipelineName,
    nodes,
    edges,
    codeTarget,
    generatedSdpCode,
    generatedSssCode,
    validatePipeline,
    savePipeline,
    deployPipeline,
  } = usePipelineStore();
  const addToast = useToastStore((s) => s.addToast);
  const addJob = useJobStatusStore((s) => s.addJob);

  const [jobName, setJobName] = useState("");
  const [codeTargetChoice, setCodeTargetChoice] = useState<"sdp" | "sss" | "hybrid">("sdp");
  const [clusterMode, setClusterMode] = useState<"new" | "existing" | "serverless">("serverless");
  const [workerCount, setWorkerCount] = useState(2);
  const [nodeType, setNodeType] = useState("i3.xlarge");
  const [sparkVersion, setSparkVersion] = useState("14.3.x-scala2.12");
  const [autoscale, setAutoscale] = useState(false);
  const [minWorkers, setMinWorkers] = useState(1);
  const [maxWorkers, setMaxWorkers] = useState(4);
  const [existingClusterId, setExistingClusterId] = useState("");
  const [catalog, setCatalog] = useState("main");
  const [targetSchema, setTargetSchema] = useState("lakestream_pipelines");
  const [catalogOptions, setCatalogOptions] = useState<string[]>([]);
  const [schemaOptions, setSchemaOptions] = useState<string[]>([]);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [checkpointExpanded, setCheckpointExpanded] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [cronExpression, setCronExpression] = useState("0 0 * * *");
  const [maxRetries, setMaxRetries] = useState(3);
  const [checkpointLocation, setCheckpointLocation] = useState("");
  const [autoGenerateCheckpoint, setAutoGenerateCheckpoint] = useState(true);
  const [validating, setValidating] = useState(false);
  const [connectionValid, setConnectionValid] = useState<boolean | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState<{
    jobUrl: string;
    jobId: string;
  } | null>(null);

  const validation = validatePipeline();
  const hasValidationErrors = !validation.valid;
  const hasSdp = !!generatedSdpCode;
  const hasSss = !!generatedSssCode;
  const canHybrid = hasSdp && hasSss;

  useEffect(() => {
    if (isOpen) {
      setJobName(pipelineName.replace(/\s+/g, "-") || "default-job");
      setConnectionValid(null);
      setDeploySuccess(null);
      if (canHybrid) {
        setCodeTargetChoice("hybrid");
      } else if (hasSss && !hasSdp) {
        setCodeTargetChoice("sss");
      } else {
        setCodeTargetChoice("sdp");
      }
    }
  }, [isOpen, pipelineName, canHybrid, hasSdp, hasSss]);

  useEffect(() => {
    if (isOpen) {
      api.validateDeployConnection().then(() => {
        api.listCatalogs().then((cats) => {
          const names = cats.map((c) => c.name);
          setCatalogOptions(names);
          if (names.length > 0 && !names.includes(catalog)) {
            setCatalog(names[0]);
          }
        }).catch(() => {});
      }).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (catalog) {
      api.listSchemas(catalog).then((schemas) => {
        const names = schemas.map((s) => s.name);
        setSchemaOptions(names);
        if (names.length > 0 && !names.includes(targetSchema)) {
          setTargetSchema(names[0]);
        }
      }).catch(() => setSchemaOptions([]));
    }
  }, [catalog]);

  useEffect(() => {
    if (autoGenerateCheckpoint && pipelineName) {
      const safe = pipelineName.replace(/\s+/g, "-").replace(/[^\w\-]/g, "_");
      setCheckpointLocation(`dbfs:/checkpoints/${safe}`);
    }
  }, [autoGenerateCheckpoint, pipelineName]);

  const handleValidateConnection = async () => {
    setValidating(true);
    setConnectionValid(null);
    try {
      const result = await api.validateDeployConnection();
      setConnectionValid(result.success ?? false);
      if (!result.success) {
        addToast(result.message || "Connection validation failed", "error");
      }
    } catch {
      setConnectionValid(false);
      addToast("Failed to validate connection", "error");
    } finally {
      setValidating(false);
    }
  };

  const handleDeploy = async () => {
    if (connectionValid !== true) {
      addToast("Please validate connection first", "error");
      return;
    }
    if (hasValidationErrors) {
      addToast(validation.errors.join(". "), "error");
      return;
    }

    setDeploying(true);
    setDeploySuccess(null);
    try {
      let id = pipelineId;
      if (!id) {
        await savePipeline();
        id = usePipelineStore.getState().pipelineId;
      }
      if (!id) {
        addToast("Failed to get pipeline ID after save", "error");
        setDeploying(false);
        return;
      }

      const cluster_config: Record<string, unknown> =
        clusterMode === "serverless"
          ? { serverless: true }
          : clusterMode === "existing"
            ? { existing_cluster_id: existingClusterId }
            : autoscale
              ? {
                  node_type_id: nodeType,
                  spark_version: sparkVersion,
                  autoscale: { min_workers: minWorkers, max_workers: maxWorkers },
                }
              : {
                  num_workers: workerCount,
                  node_type_id: nodeType,
                  spark_version: sparkVersion,
                };

      const schedule =
        continuous || clusterMode === "existing"
          ? undefined
          : cronExpression;

      const request = {
        pipeline_id: id,
        job_name: jobName.trim() || pipelineName.replace(/\s+/g, "-") || "default-job",
        cluster_config,
        code_target: codeTargetChoice === "hybrid" ? undefined : codeTargetChoice,
        schedule,
        max_retries: maxRetries,
        checkpoint_location: checkpointLocation.trim() || undefined,
        catalog: catalog.trim() || undefined,
        target_schema: targetSchema.trim() || undefined,
      };

      const result = await deployPipeline(request);
      setDeploySuccess({
        jobUrl: result.job_url,
        jobId: result.job_id,
      });
      addJob(result.job_id, pipelineName || "Pipeline", result.job_url);
      addToast("Pipeline deployed successfully", "success");
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } }; userMessage?: string };
      const msg =
        axErr?.response?.data?.detail
        || axErr?.userMessage
        || (err instanceof Error ? err.message : "Deployment failed");
      addToast(msg, "error");
    } finally {
      setDeploying(false);
    }
  };

  const handleClose = () => {
    setDeploySuccess(null);
    setConnectionValid(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
          <h2 className="text-lg font-semibold text-[#e8eaed]">Deploy to Databricks</h2>
          <button
            onClick={handleClose}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e8eaed]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* 1. Pipeline Summary */}
          <div className="rounded-lg border border-[#30363d] bg-[#21262d80] p-4">
            <h3 className="mb-2 text-sm font-medium text-[#c9d1d9]">Pipeline Summary</h3>
            <div className="space-y-1 text-sm text-[#8b949e]">
              <p>
                <span className="text-[#484f58]">Name:</span>{" "}
                <span className="text-[#e8eaed]">{pipelineName || "Untitled"}</span>
              </p>
              <p>
                <span className="text-[#484f58]">Nodes:</span> {nodes.length} ·{" "}
                <span className="text-[#484f58]">Edges:</span> {edges.length}
              </p>
              <p>
                <span className="text-[#484f58]">Code target:</span>{" "}
                {formatCodeTarget(codeTarget)}
              </p>
            </div>
            {hasValidationErrors && (
              <div className="mt-2 flex items-start gap-2 rounded bg-amber-500/20 p-2 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Pipeline has validation errors. Fix them before deploying.</span>
              </div>
            )}
          </div>

          {/* 2. Job Configuration */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-[#c9d1d9]">Job Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#484f58]">Job name</label>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder={pipelineName || "my-job"}
                  className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs text-[#484f58]">Code target</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors ${canHybrid ? "cursor-pointer hover:bg-[#21262d]" : "cursor-not-allowed opacity-50"}`}>
                    <input
                      type="radio"
                      name="code_target"
                      checked={codeTargetChoice === "hybrid"}
                      onChange={() => setCodeTargetChoice("hybrid")}
                      disabled={!canHybrid}
                      className="text-[#1f6feb]"
                    />
                    <div>
                      <span className="text-sm text-[#c9d1d9]">
                        Hybrid (SDP + SSS)
                      </span>
                      {canHybrid && (
                        <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          Recommended
                        </span>
                      )}
                      <p className="text-xs text-[#484f58]">
                        {canHybrid
                          ? "Multi-task job: SDP pipeline then SSS streaming"
                          : "Requires both SDP and SSS code — generate code first"}
                      </p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors ${hasSdp ? "cursor-pointer hover:bg-[#21262d]" : "cursor-not-allowed opacity-50"}`}>
                    <input
                      type="radio"
                      name="code_target"
                      checked={codeTargetChoice === "sdp"}
                      onChange={() => setCodeTargetChoice("sdp")}
                      disabled={!hasSdp}
                      className="text-[#1f6feb]"
                    />
                    <div>
                      <span className="text-sm text-[#c9d1d9]">
                        Lakeflow Declarative Pipelines (SDP)
                      </span>
                      <p className="text-xs text-[#484f58]">
                        DLT pipeline for batch and streaming tables
                      </p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors ${hasSss ? "cursor-pointer hover:bg-[#21262d]" : "cursor-not-allowed opacity-50"}`}>
                    <input
                      type="radio"
                      name="code_target"
                      checked={codeTargetChoice === "sss"}
                      onChange={() => setCodeTargetChoice("sss")}
                      disabled={!hasSss}
                      className="text-[#1f6feb]"
                    />
                    <div>
                      <span className="text-sm text-[#c9d1d9]">
                        Spark Structured Streaming
                      </span>
                      <p className="text-xs text-[#484f58]">
                        Standalone streaming job with manual checkpointing
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Compute Configuration */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-[#c9d1d9]">Compute Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#484f58]">Cluster mode</label>
                <select
                  value={clusterMode}
                  onChange={(e) => setClusterMode(e.target.value as "new" | "existing" | "serverless")}
                  className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                >
                  <option value="serverless">Serverless</option>
                  <option value="new">New Job Cluster</option>
                  <option value="existing">Existing Cluster</option>
                </select>
              </div>
              {clusterMode === "serverless" && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-xs text-emerald-400 font-medium">Serverless Compute</p>
                  <p className="mt-1 text-xs text-[#8b949e]">
                    Databricks manages infrastructure automatically. No cluster
                    configuration needed — instant startup with pay-per-use pricing.
                  </p>
                </div>
              )}
              {clusterMode === "new" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-[#484f58]">Worker count</label>
                    <input
                      type="number"
                      min={0}
                      value={workerCount}
                      onChange={(e) => setWorkerCount(parseInt(e.target.value, 10) || 0)}
                      className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#484f58]">Node type</label>
                    <input
                      type="text"
                      value={nodeType}
                      onChange={(e) => setNodeType(e.target.value)}
                      placeholder="i3.xlarge"
                      className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#484f58]">Spark version</label>
                    <input
                      type="text"
                      value={sparkVersion}
                      onChange={(e) => setSparkVersion(e.target.value)}
                      placeholder="14.3.x-scala2.12"
                      className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoscale"
                      checked={autoscale}
                      onChange={(e) => setAutoscale(e.target.checked)}
                      className="rounded text-[#1f6feb]"
                    />
                    <label htmlFor="autoscale" className="text-sm text-[#c9d1d9]">
                      Autoscale
                    </label>
                  </div>
                  {autoscale && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-[#484f58]">Min workers</label>
                        <input
                          type="number"
                          min={0}
                          value={minWorkers}
                          onChange={(e) => setMinWorkers(parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#484f58]">Max workers</label>
                        <input
                          type="number"
                          min={0}
                          value={maxWorkers}
                          onChange={(e) => setMaxWorkers(parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              {clusterMode === "existing" && (
                <div>
                  <label className="mb-1 block text-xs text-[#484f58]">Cluster ID</label>
                  <input
                    type="text"
                    value={existingClusterId}
                    onChange={(e) => setExistingClusterId(e.target.value)}
                    placeholder="1234-567890-abcdef"
                    className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3b. Unity Catalog Target */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-[#c9d1d9]">Unity Catalog Target</h3>
            {clusterMode === "serverless" && (
              <p className="mb-2 text-xs text-amber-400">Required for serverless compute</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[#484f58]">Catalog</label>
                <div className="relative">
                  <input
                    type="text"
                    value={catalog}
                    onChange={(e) => setCatalog(e.target.value)}
                    placeholder="main"
                    list="catalog-options"
                    className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                  />
                  <datalist id="catalog-options">
                    {catalogOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#484f58]">Schema</label>
                <div className="relative">
                  <input
                    type="text"
                    value={targetSchema}
                    onChange={(e) => setTargetSchema(e.target.value)}
                    placeholder="default"
                    list="schema-options"
                    className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                  />
                  <datalist id="schema-options">
                    {schemaOptions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Schedule (collapsible) */}
          <div className="rounded-lg border border-[#30363d]">
            <button
              type="button"
              onClick={() => setScheduleExpanded(!scheduleExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#c9d1d9] hover:bg-[#21262d80]"
            >
              Schedule
              {scheduleExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {scheduleExpanded && (
              <div className="space-y-3 border-t border-[#30363d] p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="continuous"
                    checked={continuous}
                    onChange={(e) => setContinuous(e.target.checked)}
                    className="rounded text-[#1f6feb]"
                  />
                  <label htmlFor="continuous" className="text-sm text-[#c9d1d9]">
                    Continuous (streaming)
                  </label>
                </div>
                {!continuous && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-[#484f58]">
                        Cron expression
                      </label>
                      <input
                        type="text"
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                        placeholder="0 0 * * *"
                        className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                      />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {CRON_EXAMPLES.map((ex) => (
                          <button
                            key={ex.value}
                            type="button"
                            onClick={() => setCronExpression(ex.value)}
                            className="rounded bg-[#30363d] px-2 py-0.5 text-xs text-[#8b949e] hover:bg-[#30363d] hover:text-[#e8eaed]"
                          >
                            {ex.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[#484f58]">
                        Max retries
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={maxRetries}
                        onChange={(e) => setMaxRetries(parseInt(e.target.value, 10) || 0)}
                        className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                      />
                    </div>
                  </>
                )}
                {continuous && (
                  <div>
                    <label className="mb-1 block text-xs text-[#484f58]">Max retries</label>
                    <input
                      type="number"
                      min={0}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(parseInt(e.target.value, 10) || 0)}
                      className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Checkpoint Configuration (collapsible) */}
          <div className="rounded-lg border border-[#30363d]">
            <button
              type="button"
              onClick={() => setCheckpointExpanded(!checkpointExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#c9d1d9] hover:bg-[#21262d80]"
            >
              Checkpoint Configuration
              {checkpointExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {checkpointExpanded && (
              <div className="space-y-3 border-t border-[#30363d] p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="auto_checkpoint"
                    checked={autoGenerateCheckpoint}
                    onChange={(e) => setAutoGenerateCheckpoint(e.target.checked)}
                    className="rounded text-[#1f6feb]"
                  />
                  <label htmlFor="auto_checkpoint" className="text-sm text-[#c9d1d9]">
                    Auto-generate from pipeline name
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#484f58]">
                    Checkpoint location
                  </label>
                  <input
                    type="text"
                    value={checkpointLocation}
                    onChange={(e) => setCheckpointLocation(e.target.value)}
                    placeholder="dbfs:/checkpoints/my-pipeline"
                    disabled={autoGenerateCheckpoint}
                    className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#e8eaed] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] disabled:opacity-60"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 6. Deploy Action */}
          <div className="space-y-3 border-t border-[#30363d] pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleValidateConnection}
                disabled={validating}
                className="flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed] disabled:opacity-60"
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Validate Connection
              </button>
              {connectionValid === true && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <Check className="h-4 w-4" />
                  Connected
                </span>
              )}
              {connectionValid === false && (
                <span className="flex items-center gap-1 text-sm text-red-400">
                  <XCircle className="h-4 w-4" />
                  Connection failed
                </span>
              )}
            </div>

            {deploySuccess ? (
              <div className="rounded-lg bg-emerald-500/20 p-4">
                <p className="mb-2 text-sm font-medium text-emerald-400">
                  Deployment successful
                </p>
                <a
                  href={deploySuccess.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#58a6ff] underline hover:text-blue-300"
                >
                  Open job in Databricks →
                </a>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleClose}
                  className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#e8eaed]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={
                    deploying ||
                    connectionValid !== true ||
                    hasValidationErrors ||
                    !jobName.trim() ||
                    (clusterMode === "serverless" && !catalog.trim())
                  }
                  className="flex items-center gap-2 rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#388bfd] disabled:opacity-60"
                >
                  {deploying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Deploy to Databricks
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
