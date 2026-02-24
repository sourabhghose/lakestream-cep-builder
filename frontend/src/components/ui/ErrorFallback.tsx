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
    <div className="flex flex-col items-center justify-center gap-2 rounded border border-[#d2992230] bg-[#d2992215] p-4">
      <AlertCircle className="h-6 w-6 text-[#d29922]" />
      <p className="text-sm text-[#8b949e]">{message}</p>
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
