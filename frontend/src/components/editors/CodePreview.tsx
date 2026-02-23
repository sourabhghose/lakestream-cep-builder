"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/hooks/usePipelineStore";

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
  const { generatedSdpCode, generatedSssCode, setGeneratedCode } = usePipelineStore();
  const [activeTab, setActiveTab] = useState<"sdp" | "sss">("sdp");
  const [isEditing, setIsEditing] = useState(false);

  const code = activeTab === "sdp" ? generatedSdpCode : generatedSssCode;
  const displayCode = code || PLACEHOLDER;

  const handleEditorChange = (value: string | undefined) => {
    if (activeTab === "sdp") {
      setGeneratedCode(value ?? "", generatedSssCode);
    } else {
      setGeneratedCode(generatedSdpCode, value ?? "");
    }
  };

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
            <LucideIcons.Pencil className="h-3.5 w-3.5" />
            {isEditing ? "Editing" : "Edit"}
          </button>
          <button
            onClick={onToggleCollapse}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <LucideIcons.ChevronDown
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
