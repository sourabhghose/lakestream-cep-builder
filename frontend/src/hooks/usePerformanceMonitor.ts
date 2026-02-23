"use client";

import { useEffect, useRef } from "react";

const isDev =
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "development" &&
  (typeof process.env.NEXT_PUBLIC_ENVIRONMENT === "undefined" ||
    process.env.NEXT_PUBLIC_ENVIRONMENT === "development");

/**
 * Dev-only performance monitor. Tracks render count, last render time,
 * and warns in console if render takes > 16ms (dropped frame).
 * Only active when NODE_ENV=development.
 */
export function usePerformanceMonitor(componentName: string): void {
  const renderCount = useRef(0);
  const renderStartTime = useRef(0);

  if (!isDev) return;

  renderCount.current += 1;
  renderStartTime.current = performance.now();

  useEffect(() => {
    if (!isDev) return;
    const renderDuration = performance.now() - renderStartTime.current;
    if (renderDuration > 16) {
      console.warn(
        `[Perf] ${componentName} render #${renderCount.current} took ${renderDuration.toFixed(1)}ms (dropped frame)`
      );
    }
  });
}
