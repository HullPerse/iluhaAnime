import { useEffect, useRef } from "react";

import {
  getAction,
  shouldIgnoreHotkeys,
  type KeybindAction,
} from "@/config/player/keybinds.config";

const SINGLE_SHOT: ReadonlySet<KeybindAction> = new Set([
  "playPause",
  "toggleMute",
  "toggleFullscreen",
  "toggleCheatsheet",
  "toggleAutoHide",
  "toggleDiagnostics",
  "exitCinemaMode",
  "jumpToTime",
]);

function Keyboard({
  onAction,
  onWheel,
}: {
  onAction: (action: KeybindAction) => void;
  onWheel?: (direction: number) => void;
}) {
  const actionRef = useRef(onAction);
  const wheelRef = useRef(onWheel);

  useEffect(() => {
    actionRef.current = onAction;
    wheelRef.current = onWheel;
  }, [onAction, onWheel]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreHotkeys(event.target)) return;
      const action = getAction(
        event.code,
        event.ctrlKey,
        event.shiftKey,
        event.altKey,
      );
      if (!action) return;
      if (event.repeat && SINGLE_SHOT.has(action.action)) return;
      event.preventDefault();
      actionRef.current(action.action);
    };

    const handleWheel = (event: WheelEvent) => {
      if (shouldIgnoreHotkeys(event.target)) return;
      wheelRef.current?.(event.deltaY > 0 ? -1 : 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return null;
}

export default Keyboard;