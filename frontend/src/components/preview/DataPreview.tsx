"use client";

import { cn } from "@/lib/utils";

export interface DataPreviewProps {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  className?: string;
}

export default function DataPreview({
  columns,
  rows,
  rowCount,
  className,
}: DataPreviewProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-900",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
          Synthetic data preview
        </span>
        <span className="text-xs text-slate-500">
          {rowCount} row{rowCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="max-h-[240px] overflow-auto">
        <table className="w-full min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="border-b border-slate-700 px-3 py-2 font-medium text-slate-300"
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
                  "border-b border-slate-800/80",
                  i % 2 === 0 ? "bg-slate-900/50" : "bg-slate-800/30"
                )}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="max-w-[180px] truncate px-3 py-1.5 text-slate-300"
                    title={
                      typeof cell === "string" && cell.length > 50
                        ? cell
                        : String(cell ?? "")
                    }
                  >
                    {cell == null ? (
                      <span className="text-slate-500">null</span>
                    ) : typeof cell === "object" ? (
                      JSON.stringify(cell)
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
