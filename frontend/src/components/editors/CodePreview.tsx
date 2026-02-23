"use client";

import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import {
  Loader2,
  Check,
  AlertTriangle,
  AlertCircle,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import * as api from "@/lib/api";

interface CodePreviewProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

const PLACEHOLDER = "// Pipeline code will be generated here...";

export default function CodePreview({
  collapsed = false,
  onToggleCollapse,
  className,
}: CodePreviewProps) {
  const {
    generatedSdpCode,
    generatedSssCode,
    setGeneratedCode,
    syncFromCode,
    codeTarget,
    isGenerating,
  } = usePipelineStore();
  const [activeTab, setActiveTab] = useState<"sdp" | "sss">("sdp");
  const [isEditing, setIsEditing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "warnings" | "parsing" | "error" | null>(null);
  const [syncMessage, setSyncMessage] = useState<string>("");
  const parseTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const userEditedRef = useRef(false);

  const hasSdp = !!generatedSdpCode;
  const hasSss = !!generatedSssCode;
  const isHybrid = hasSdp && hasSss;

  useEffect(() => {
    if (activeTab === "sdp" && !hasSdp && hasSss) setActiveTab("sss");
    if (activeTab === "sss" && !hasSss && hasSdp) setActiveTab("sdp");
  }, [hasSdp, hasSss, activeTab]);

  const code = activeTab === "sdp" ? generatedSdpCode : generatedSssCode;
  const displayCode = code || PLACEHOLDER;

  const handleEditorChange = (value: string | undefined) => {
    userEditedRef.current = true;
    if (activeTab === "sdp") {
      setGeneratedCode(value ?? "", generatedSssCode);
    } else {
      setGeneratedCode(generatedSdpCode, value ?? "");
    }
  };

  // Debounced parse: when user edits SDP code, parse after 1s and sync to canvas
  useEffect(() => {
    if (!isEditing || activeTab !== "sdp" || !userEditedRef.current) return;
    const code = generatedSdpCode || "";
    if (!code.trim() || code === PLACEHOLDER) return;

    clearTimeout(parseTimeoutRef.current);
    parseTimeoutRef.current = setTimeout(async () => {
      setSyncStatus("parsing");
      try {
        const result = await api.parseCode(code);
        if (result.nodes.length > 0) {
          syncFromCode(result.nodes, result.edges);
          userEditedRef.current = false;
          if (result.warnings.length > 0) {
            setSyncStatus("warnings");
            setSyncMessage(result.warnings.join("; "));
          } else {
            setSyncStatus("synced");
            setSyncMessage("");
          }
        } else {
          setSyncStatus(null);
        }
      } catch {
        setSyncStatus("error");
        setSyncMessage("Parse failed");
      }
      setTimeout(() => setSyncStatus(null), 4000);
    }, 1000);
    return () => clearTimeout(parseTimeoutRef.current);
  }, [isEditing, activeTab, generatedSdpCode, syncFromCode]);

  return (
    <div
      className={cn(
        "flex flex-col border-t border-slate-700 bg-slate-900/95",
        collapsed && "max-h-12",
        className
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-700 px-4">
        <div className="flex items-center gap-2">
          {isGenerating && (
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </span>
          )}
          {codeTarget && !isGenerating && (
            <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">
              {codeTarget.toUpperCase()}
            </span>
          )}
          {(isHybrid || hasSdp) && (
            <button
              onClick={() => setActiveTab("sdp")}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium",
                activeTab === "sdp"
                  ? "bg-slate-700 text-slate-200"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              SDP (SQL/Python)
            </button>
          )}
          {(isHybrid || hasSss) && (
            <button
              onClick={() => setActiveTab("sss")}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium",
                activeTab === "sss"
                  ? "bg-slate-700 text-slate-200"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              Structured Streaming (PySpark)
            </button>
          )}
          {!hasSdp && !hasSss && !isGenerating && (
            <span className="text-sm text-slate-500">
              Add nodes to generate code
            </span>
          )}
          {syncStatus === "synced" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Canvas synced from code
            </span>
          )}
          {syncStatus === "warnings" && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400" title={syncMessage}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Parse warnings: {syncMessage.slice(0, 50)}{syncMessage.length > 50 ? "…" : ""}
            </span>
          )}
          {syncStatus === "parsing" && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Parsing…
            </span>
          )}
          {syncStatus === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {syncMessage}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1.5 text-sm",
              isEditing
                ? "bg-blue-600/20 text-blue-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            )}
            title={isEditing ? "Read-only mode" : "Edit mode"}
          >
            <Pencil className="h-3.5 w-3.5" />
            {isEditing ? "Editing" : "Edit"}
          </button>
          <button
            onClick={onToggleCollapse}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
            />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="h-[300px] min-h-[300px] flex-1 overflow-hidden">
          <Editor
            height="300px"
            defaultLanguage={activeTab === "sdp" ? "sql" : "python"}
            value={displayCode}
            theme="vs-dark"
            onChange={isEditing ? handleEditorChange : undefined}
            options={{
              readOnly: !isEditing,
              minimap: { enabled: false },
              fontSize: 12,
            }}
          />
        </div>
      )}
    </div>
  );
}
