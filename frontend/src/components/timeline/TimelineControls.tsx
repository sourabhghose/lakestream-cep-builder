"use client";

import { useRef } from "react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

interface TimelineControlsProps {
  isPlaying?: boolean;
  onPlayPause?: () => void;
  speed?: number;
  onSpeedChange?: (speed: number) => void;
  timeRange?: { min: number; max: number };
  currentTime?: number;
  onTimeChange?: (time: number) => void;
  onLoadSampleData?: (events: { id: string; type: string; timestamp: number; data?: Record<string, unknown> }[]) => void;
  hasData?: boolean;
  className?: string;
}

export default function TimelineControls({
  isPlaying = false,
  onPlayPause,
  speed = 1,
  onSpeedChange,
  timeRange,
  currentTime = 0,
  onTimeChange,
  onLoadSampleData,
  hasData = false,
  className,
}: TimelineControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadSampleData = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onLoadSampleData) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);
        const events = Array.isArray(parsed) ? parsed : parsed.events ?? [];
        const normalized = events.map((ev: Record<string, unknown>, i: number) => ({
          id: String(ev.id ?? `ev-${i}`),
          type: String(ev.type ?? ev.event_type ?? "unknown"),
          timestamp: Number(ev.timestamp ?? ev.ts ?? Date.now()),
          data: typeof ev.data === "object" ? (ev.data as Record<string, unknown>) : undefined,
        }));
        onLoadSampleData(normalized);
      } catch {
        console.error("Failed to parse JSON file");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const formatTime = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {onPlayPause && (
        <button
          onClick={onPlayPause}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-200"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <LucideIcons.Pause className="h-4 w-4" />
          ) : (
            <LucideIcons.Play className="h-4 w-4" />
          )}
        </button>
      )}

      {onSpeedChange && (
        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium",
                speed === s
                  ? "bg-purple-600 text-white"
                  : "border border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      )}

      {timeRange && onTimeChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {formatTime(timeRange.min)} – {formatTime(timeRange.max)}
          </span>
          <input
            type="range"
            min={timeRange.min}
            max={timeRange.max}
            value={currentTime}
            onChange={(e) => onTimeChange(Number(e.target.value))}
            className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-slate-700 accent-purple-500"
          />
        </div>
      )}

      {onLoadSampleData && (
        <button
          onClick={handleLoadSampleData}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium",
            hasData
              ? "border-green-600/50 bg-green-600/10 text-green-400"
              : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-200"
          )}
        >
          <LucideIcons.Upload className="h-3.5 w-3.5" />
          {hasData ? "Data loaded" : "Load Sample Data"}
        </button>
      )}
    </div>
  );
}
