/**
 * Performance utilities for large pipeline optimization.
 */

/** Standard debounce - delays execution until after ms of inactivity. */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: unknown, ...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn.apply(this, args);
    }, ms);
  };
}

/** Standard throttle - limits execution to once per ms. Uses trailing call to apply latest args. */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let lastThis: unknown;
  const invoke = () => {
    if (lastArgs !== undefined) {
      fn.apply(lastThis, lastArgs);
      lastArgs = undefined;
    }
  };
  return function (this: unknown, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;
    const now = Date.now();
    const elapsed = now - lastCall;
    if (elapsed >= ms || lastCall === 0) {
      lastCall = now;
      invoke();
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        lastCall = Date.now();
        invoke();
      }, ms - elapsed);
    }
  };
}

/** Batch multiple node data updates into a single store update. */
export function batchNodeUpdates<T extends Record<string, unknown>>(
  updates: Array<{ nodeId: string; data: T }>,
  applyBatch: (updates: Array<{ nodeId: string; data: T }>) => void
): void {
  if (updates.length === 0) return;
  applyBatch(updates);
}

/** Memoize function that only caches the last result (for single-arg functions). */
export function memoizeOne<T, R>(fn: (arg: T) => R): (arg: T) => R {
  let lastArg: T;
  let lastResult: R;
  let initialized = false;
  return function (arg: T): R {
    if (!initialized || lastArg !== arg) {
      lastArg = arg;
      lastResult = fn(arg);
      initialized = true;
    }
    return lastResult;
  };
}
