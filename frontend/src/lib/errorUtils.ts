import type { AxiosError } from "axios";
import type { ApiErrorWithMessage } from "@/lib/api";

/**
 * Extracts a user-friendly message from various error types (axios, network, etc.)
 */
export function formatApiError(error: unknown): string {
  if (error == null) return "An unexpected error occurred";

  if (typeof error === "string") return error;

  if (error instanceof Error) {
    const withMsg = error as ApiErrorWithMessage;
    if (withMsg.userMessage) return withMsg.userMessage;

    const axiosErr = error as AxiosError;
    if (axiosErr.isAxiosError) {
      const data = axiosErr.response?.data as Record<string, unknown> | string | null;
      if (data) {
        if (typeof data === "string") return data;
        if (typeof data.message === "string") return data.message;
        if (data.detail) {
          const detail = data.detail;
          if (typeof detail === "string") return detail;
          if (Array.isArray(detail)) {
            return detail.map((d: any) => d?.msg ?? String(d)).join("; ");
          }
        }
      }
      const status = axiosErr.response?.status;
      if (status === 401) return "Authentication required";
      if (status === 403) return "Permission denied";
      if (status === 404) return "Resource not found";
      if (status && status >= 500) return "Server error. Please try again later.";
    }
    if (isNetworkError(error)) {
      return "Cannot connect to backend. Is the server running?";
    }
    return error.message;
  }

  return "An unexpected error occurred";
}

/**
 * Detects network/timeout errors (no response, connection refused, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const axiosErr = error as AxiosError;
    if (axiosErr.isAxiosError) {
      const code = axiosErr.code;
      const status = axiosErr.response?.status;
      if (!status && code) {
        return (
          code === "ECONNABORTED" ||
          code === "ERR_NETWORK" ||
          code === "ECONNREFUSED" ||
          code === "ENOTFOUND" ||
          code === "ETIMEDOUT"
        );
      }
    }
    const msg = error.message?.toLowerCase() ?? "";
    return (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnaborted")
    );
  }
  return false;
}

/**
 * Wraps an async operation with try/catch and returns a fallback on error.
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Retries an async operation with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
