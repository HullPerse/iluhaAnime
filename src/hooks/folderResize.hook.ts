import { useCallback, useEffect, useRef, useState } from "react";

export function useBottomResize({
  height,
  minHeight,
  maxHeight,
  getStartHeight,
  onResizeEnd,
}: {
  height: number | undefined;
  minHeight: number;
  maxHeight: number;
  getStartHeight?: () => number | undefined;
  onResizeEnd: (height: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const dragStart = useRef({ y: 0, startHeight: 0 });
  const committedHeightRef = useRef(height ?? 0);
  const onResizeEndRef = useRef(onResizeEnd);
  const maxHeightRef = useRef(maxHeight);
  const getStartHeightRef = useRef(getStartHeight);

  useEffect(() => {
    committedHeightRef.current = height ?? 0;
    onResizeEndRef.current = onResizeEnd;
    maxHeightRef.current = maxHeight;
    getStartHeightRef.current = getStartHeight;
  }, [height, onResizeEnd, maxHeight, getStartHeight]);

  const clamp = useCallback(
    (value: number) => Math.max(minHeight, Math.min(maxHeightRef.current, value)),
    [minHeight]
  );

  const beginDrag = useCallback(
    (event: { clientY: number; preventDefault: () => void }) => {
      event.preventDefault();
      const measured = getStartHeightRef.current?.();
      const start =
        measured ?? (committedHeightRef.current > 0 ? committedHeightRef.current : minHeight);
      dragStart.current = { y: event.clientY, startHeight: Math.max(minHeight, start) };
      setPreviewHeight(clamp(dragStart.current.startHeight));
      setDragging(true);
    },
    [clamp, minHeight]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPreviewHeight(clamp(dragStart.current.startHeight + (e.clientY - dragStart.current.y)));
    };
    const onUp = (e: MouseEvent) => {
      setDragging(false);
      setPreviewHeight(null);
      onResizeEndRef.current(
        clamp(dragStart.current.startHeight + (e.clientY - dragStart.current.y))
      );
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, clamp]);

  const adjust = useCallback(
    (delta: number) => {
      const base = committedHeightRef.current > 0 ? committedHeightRef.current : minHeight;
      onResizeEndRef.current(clamp(base + delta));
    },
    [clamp, minHeight]
  );

  return { dragging, previewHeight, beginDrag, adjust };
}

/**
 * How many resize steps one key press means: the vim count buffer, at least
 * one. The engine guarantees digits, the fallback keeps direct callers safe.
 */
export function resolveResizeMultiplier(count: string): number {
  if (count === "") return 1;
  const parsed = Number.parseInt(count, 10);
  return Number.isNaN(parsed) ? 1 : Math.max(parsed, 1);
}
