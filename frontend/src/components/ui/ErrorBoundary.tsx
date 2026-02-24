"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { usePipelineStore } from "@/hooks/usePipelineStore";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback. Can be a ReactNode or a render function (error, reset) => ReactNode */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null });
  };

  handleResetPipeline = () => {
    usePipelineStore.getState().resetPipeline();
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const fb = this.props.fallback;
        return typeof fb === "function"
          ? fb(this.state.error, this.handleTryAgain)
          : fb;
      }

      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          onTryAgain={this.handleTryAgain}
          onResetPipeline={this.handleResetPipeline}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorBoundaryFallbackProps {
  error: Error;
  onTryAgain: () => void;
  onResetPipeline: () => void;
}

function ErrorBoundaryFallback({
  error,
  onTryAgain,
  onResetPipeline,
}: ErrorBoundaryFallbackProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-lg border border-[#f8514930] bg-[#f8514915] p-6">
      <AlertTriangle className="mb-4 h-12 w-12 text-[#f85149]" />
      <h3 className="mb-2 text-lg font-semibold text-[#e8eaed]">
        Something went wrong
      </h3>
      <p className="mb-4 text-center text-sm text-[#8b949e]">
        An unexpected error occurred. You can try again or reset the pipeline.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onTryAgain}
          className="rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#388bfd]"
        >
          Try Again
        </button>
        <button
          onClick={onResetPipeline}
          className="rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d]"
        >
          Reset Pipeline
        </button>
      </div>
      <div className="mt-4 w-full max-w-md">
        <button
          onClick={() => setDetailsOpen((o) => !o)}
          className="text-xs text-[#8b949e] hover:text-[#c9d1d9]"
        >
          {detailsOpen ? "Hide" : "Show"} error details
        </button>
        {detailsOpen && (
          <pre className="mt-2 max-h-32 overflow-auto rounded border border-[#30363d] bg-[#15191d] p-2 text-left text-xs text-[#c9d1d9]">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        )}
      </div>
    </div>
  );
}
