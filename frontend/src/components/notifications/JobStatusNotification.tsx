"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import JobStatusBadge, { type JobStatus } from "./JobStatusBadge";
import { useJobStatusStore } from "@/hooks/useJobStatusStore";
import { getJobStatus } from "@/lib/api";

const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES: JobStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"];

interface JobStatusNotificationProps {
  jobId: string;
  pipelineName: string;
  jobUrl?: string;
}

function formatElapsed(startTime: string | undefined): string {
  if (!startTime) return "";
  try {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const elapsedMs = now - start;
    const sec = Math.floor(elapsedMs / 1000);
    const min = Math.floor(sec / 60);
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
  } catch {
    return "";
  }
}

export default function JobStatusNotification({
  jobId,
  pipelineName,
  jobUrl: initialJobUrl,
}: JobStatusNotificationProps) {
  const { activeJobs, updateJobStatus, dismissJob } = useJobStatusStore();
  const job = activeJobs[jobId];
  const [elapsed, setElapsed] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = job?.status ?? "PENDING";
  const jobUrl = job?.jobUrl ?? initialJobUrl;
  const startTime = job?.startTime ?? job?.addedAt;

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await getJobStatus(jobId);
        updateJobStatus(jobId, {
          status: res.status as JobStatus,
          jobUrl: res.run_url ?? jobUrl,
          startTime: res.start_time,
          durationMs: res.duration_ms,
        });
        if (TERMINAL_STATUSES.includes(res.status as JobStatus)) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // Ignore poll errors
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [jobId, jobUrl, updateJobStatus]);

  useEffect(() => {
    if (TERMINAL_STATUSES.includes(status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [status]);

  useEffect(() => {
    const tick = () => setElapsed(formatElapsed(startTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const handleDismiss = () => dismissJob(jobId);

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-slate-200">
          {pipelineName || "Pipeline"}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          Job {jobId.slice(0, 8)}…
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <JobStatusBadge status={status} />
          {elapsed && (
            <span className="text-xs text-slate-500">{elapsed} elapsed</span>
          )}
        </div>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            Open in Databricks
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
