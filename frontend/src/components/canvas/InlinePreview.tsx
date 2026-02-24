"use client";

import { cn } from "@/lib/utils";

const MAX_COLUMNS = 4;
const MAX_ROWS = 3;
const MAX_CELL_LENGTH = 12;

function truncate(val: string | number | boolean | null): string {
  if (val == null) return "null";
  const s = typeof val === "object" ? JSON.stringify(val) : String(val);
  return s.length > MAX_CELL_LENGTH ? s.slice(0, MAX_CELL_LENGTH) + "…" : s;
}

export interface InlinePreviewProps {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  className?: string;
}

export default function InlinePreview({
  columns,
  rows,
  className,
}: InlinePreviewProps) {
  const visibleCols = columns.slice(0, MAX_COLUMNS);
  const hasMoreCols = columns.length > MAX_COLUMNS;
  const visibleRows = rows.slice(0, MAX_ROWS);
  const hasMoreRows = rows.length > MAX_ROWS;

  return (
    <div
      className={cn(
        "max-h-[80px] overflow-hidden rounded-md border border-[#30363d99] bg-[#30363d]/40",
        className
      )}
    >
      <table className="w-full min-w-0 border-collapse text-left">
        <thead>
          <tr>
            {visibleCols.map((col) => (
              <th
                key={col}
                className="border-b border-[#30363d99] px-2 py-1 text-[10px] font-medium text-[#8b949e]"
              >
                {truncate(col)}
              </th>
            ))}
            {hasMoreCols && (
              <th className="border-b border-[#30363d99] px-1 py-1 text-[10px] text-[#484f58]">
                …
              </th>
            )}
          </tr>
        </thead>
        <tbody className="font-mono text-xs text-[#c9d1d9]">
          {visibleRows.map((row, i) => (
            <tr key={i} className="border-b border-[#30363d]/40 last:border-0">
              {visibleCols.map((_, j) => (
                <td
                  key={j}
                  className="max-w-[60px] truncate px-2 py-0.5"
                  title={String(row[j] ?? "")}
                >
                  {truncate(row[j] ?? null)}
                </td>
              ))}
              {hasMoreCols && (
                <td className="px-1 py-0.5 text-[#484f58]">…</td>
              )}
            </tr>
          ))}
          {hasMoreRows && (
            <tr>
              <td
                colSpan={visibleCols.length + (hasMoreCols ? 1 : 0)}
                className="px-2 py-0.5 text-[10px] text-[#484f58]"
              >
                …
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
