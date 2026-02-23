"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

interface ErrorFallbackProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorFallback({
  message = "Something went wrong",
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <AlertCircle className="h-6 w-6 text-amber-500 dark:text-amber-400" />
      <p className="text-sm text-gray-600 dark:text-slate-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}
