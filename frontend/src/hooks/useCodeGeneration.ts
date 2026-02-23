import { useEffect, useRef } from "react";
import { usePipelineStore } from "./usePipelineStore";

export function useCodeGeneration() {
  const { nodes, edges, triggerCodeGen } = usePipelineStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (nodes.length === 0) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      triggerCodeGen();
    }, 500);
    return () => clearTimeout(timeoutRef.current);
  }, [nodes, edges, triggerCodeGen]);
}
