"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type Direction = "horizontal" | "vertical";

interface UseResizableOptions {
  direction: Direction;
  initialSize: number;
  minSize: number;
  maxSize: number;
  storageKey?: string;
}

export function useResizable({
  direction,
  initialSize,
  minSize,
  maxSize,
  storageKey,
}: UseResizableOptions) {
  const [size, setSize] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) return parsed;
      }
    }
    return initialSize;
  });

  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(size));
    }
  }, [size, storageKey]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      startSize.current = size;
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const currentPos =
          direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = currentPos - startPos.current;
        const newSize = Math.min(
          maxSize,
          Math.max(minSize, startSize.current + delta)
        );
        setSize(newSize);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [direction, size, minSize, maxSize]
  );

  return { size, onMouseDown };
}

export function useResizableReverse({
  direction,
  initialSize,
  minSize,
  maxSize,
  storageKey,
}: UseResizableOptions) {
  const [size, setSize] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) return parsed;
      }
    }
    return initialSize;
  });

  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(size));
    }
  }, [size, storageKey]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      startSize.current = size;
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const currentPos =
          direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = startPos.current - currentPos;
        const newSize = Math.min(
          maxSize,
          Math.max(minSize, startSize.current + delta)
        );
        setSize(newSize);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [direction, size, minSize, maxSize]
  );

  return { size, onMouseDown };
}
