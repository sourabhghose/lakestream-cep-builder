"use client";

import { Check, X, Minus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

interface JobStatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export default function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const config = {
    PENDING: {
      icon: (
        <span
          className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"
          aria-hidden
        />
      ),
      label: "Pending",
      styles: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    },
    RUNNING: {
      icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
      label: "Running",
      styles: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    },
    SUCCEEDED: {
      icon: <Check className="h-3 w-3" aria-hidden />,
      label: "Succeeded",
      styles: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    },
    FAILED: {
      icon: <X className="h-3 w-3" aria-hidden />,
      label: "Failed",
      styles: "bg-red-500/20 text-red-400 border-red-500/40",
    },
    CANCELLED: {
      icon: <Minus className="h-3 w-3" aria-hidden />,
      label: "Cancelled",
      styles: "bg-slate-500/20 text-slate-400 border-slate-500/40",
    },
  };

  const { icon, label, styles } = config[status] ?? config.PENDING;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        styles,
        className
      )}
      role="status"
      aria-label={`Job status: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
