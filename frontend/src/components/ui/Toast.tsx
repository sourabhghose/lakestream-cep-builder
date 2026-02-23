"use client";

import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type Toast as ToastItem, type ToastVariant } from "@/hooks/useToastStore";

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; icon: keyof typeof LucideIcons }
> = {
  success: {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/50",
    icon: "CheckCircle",
  },
  error: {
    bg: "bg-red-500/15",
    border: "border-red-500/50",
    icon: "AlertCircle",
  },
  warning: {
    bg: "bg-amber-500/15",
    border: "border-amber-500/50",
    icon: "AlertTriangle",
  },
  info: {
    bg: "bg-blue-500/15",
    border: "border-blue-500/50",
    icon: "Info",
  },
};

function ToastItemComponent({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const style = VARIANT_STYLES[toast.variant];
  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
      style.icon
    ] ?? LucideIcons.Info;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur",
        style.bg,
        style.border
      )}
    >
      <IconComponent className="h-5 w-5 shrink-0 text-current opacity-80" />
      <p className="flex-1 text-sm font-medium text-slate-200">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
        aria-label="Dismiss"
      >
        <LucideIcons.X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 right-4 z-[100] flex max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItemComponent key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
