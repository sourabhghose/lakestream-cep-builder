"use client";

import { cn } from "@/lib/utils";

export interface DataPreviewProps {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  source?: "live" | "synthetic";
  className?: string;
}

function tryParseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse errors and render as plain text.
  }
  return null;
}

export default function DataPreview({
  columns,
  rows,
  rowCount,
  source = "synthetic",
  className,
}: DataPreviewProps) {
  const isLive = source === "live";
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-[#30363d] bg-[#161b22]",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-[#30363d] px-3 py-2">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium",
            isLive
              ? "bg-green-500/20 text-green-400"
              : "bg-amber-500/20 text-amber-400"
          )}
        >
          {isLive ? "Live data" : "Synthetic data"}
        </span>
        <span className="text-xs text-[#484f58]">
          {rowCount} row{rowCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="max-h-[240px] overflow-auto">
        <table className="w-full min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#21262d]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={cn(
                    "border-b border-[#30363d] px-3 py-2 font-medium text-[#c9d1d9]",
                    col === "value" ? "min-w-[360px]" : ""
                  )}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-[#21262d]",
                  i % 2 === 0 ? "bg-[#161b22]/50" : "bg-[#21262d]/30"
                )}
              >
                {row.map((cell, j) => (
                  (() => {
                    const parsedJson = tryParseJsonObject(cell);
                    const columnName = columns[j];
                    const isStructuredValue = parsedJson && columnName === "value";
                    return (
                  <td
                    key={j}
                    className={cn(
                      "px-3 py-1.5 text-[#c9d1d9]",
                      isStructuredValue
                        ? "min-w-[360px] max-w-[560px] align-top"
                        : "max-w-[180px] truncate"
                    )}
                    title={
                      typeof cell === "string" && cell.length > 50 && !isStructuredValue
                        ? cell
                        : String(cell ?? "")
                    }
                  >
                    {cell == null ? (
                      <span className="text-[#484f58]">null</span>
                    ) : isStructuredValue ? (
                      <details className="group rounded border border-[#30363d] bg-[#0d1117] p-2">
                        <summary className="cursor-pointer text-xs font-medium text-[#8b949e]">
                          Event payload
                        </summary>
                        <pre className="mt-2 max-h-44 overflow-auto rounded bg-[#010409] p-2 text-[11px] leading-5 text-[#c9d1d9] whitespace-pre-wrap break-words">
{JSON.stringify(parsedJson, null, 2)}
                        </pre>
                      </details>
                    ) : typeof cell === "object" ? (
                      JSON.stringify(cell)
                    ) : (
                      String(cell)
                    )}
                  </td>
                    );
                  })()
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
