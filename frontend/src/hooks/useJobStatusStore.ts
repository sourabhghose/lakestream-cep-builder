"use client";

import { create } from "zustand";

export type JobStatusValue =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface JobStatus {
  jobId: string;
  pipelineName: string;
  status: JobStatusValue;
  jobUrl?: string;
  startTime?: string;
  durationMs?: number;
  addedAt?: string; // ISO string when job was added (for elapsed time)
}

export interface JobStatusState {
  activeJobs: Record<string, JobStatus>;
  addJob: (jobId: string, pipelineName: string, jobUrl?: string) => void;
  updateJobStatus: (jobId: string, status: Partial<JobStatus>) => void;
  dismissJob: (jobId: string) => void;
}

export const useJobStatusStore = create<JobStatusState>((set) => ({
  activeJobs: {},

  addJob: (jobId: string, pipelineName: string, jobUrl?: string) =>
    set((state) => ({
      activeJobs: {
        ...state.activeJobs,
        [jobId]: {
          ...state.activeJobs[jobId],
          jobId: jobId,
          pipelineName,
          status: "PENDING" as const,
          jobUrl,
          addedAt: new Date().toISOString(),
        },
      },
    })),

  updateJobStatus: (jobId: string, status: Partial<JobStatus>) =>
    set((state) => {
      const existing = state.activeJobs[jobId];
      if (!existing) return state;
      return {
        activeJobs: {
          ...state.activeJobs,
          [jobId]: { ...existing, ...status },
        },
      };
    }),

  dismissJob: (jobId: string) =>
    set((state) => {
      const next = { ...state.activeJobs };
      delete next[jobId];
      return { activeJobs: next };
    }),
}));
