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
        "flex flex-col overflow-hidden rounded-md border border-[#30363d] bg-[#161b22]",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-[#30363d] px-3 py-2">
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
          Synthetic data preview
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
                  className="border-b border-[#30363d] px-3 py-2 font-medium text-[#c9d1d9]"
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
                  <td
                    key={j}
                    className="max-w-[180px] truncate px-3 py-1.5 text-[#c9d1d9]"
                    title={
                      typeof cell === "string" && cell.length > 50
                        ? cell
                        : String(cell ?? "")
                    }
                  >
                    {cell == null ? (
                      <span className="text-[#484f58]">null</span>
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
