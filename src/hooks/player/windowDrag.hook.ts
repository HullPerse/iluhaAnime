import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";

import { shouldStartWindowDrag, startsOnPlayerControl } from "@/lib/player/drag.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";

export interface WindowDragHandlers {
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseMove: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseUp: () => void;
  consumeDrag: () => boolean;
}

export function useWindowDrag(enabled: boolean): WindowDragHandlers {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      draggedRef.current = false;
      if (!enabled) return;
      if (event.button !== 0) return;
      if (startsOnPlayerControl(event.target)) return;
      originRef.current = { x: event.clientX, y: event.clientY };
    },
    [enabled]
  );

  const onMouseMove = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const origin = originRef.current;
    if (!origin) return;
    if (!shouldStartWindowDrag(origin.x, origin.y, event.clientX, event.clientY)) return;
    originRef.current = null;
    draggedRef.current = true;
    ignore(withFallback(getCurrentWindow().startDragging(), undefined));
  }, []);

  const onMouseUp = useCallback(() => {
    originRef.current = null;
  }, []);

  const consumeDrag = useCallback((): boolean => {
    if (!draggedRef.current) return false;
    draggedRef.current = false;
    return true;
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp, consumeDrag };
}
