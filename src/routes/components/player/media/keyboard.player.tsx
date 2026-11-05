import { useEffect, useRef } from "react";

import { PLAYER_HOTKEYS } from "@/config/settings/keybinds.config";
import type { KeybindAction } from "@/types/ui/keybinds";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { shouldIgnoreHotkeys, shouldIgnorePlayerHotkeys } from "@/lib/core/filterHotkeys.utils";
import { isInsideScrollable } from "@/lib/ui/scroll.utils";

function Keyboard({
  onAction,
  onWheel,
  onFullscreenKey,
}: {
  onAction: (action: KeybindAction) => void;
  onWheel?: (direction: number) => void;
  onFullscreenKey?: () => void;
}) {
  const actionRef = useRef<(action: KeybindAction) => void>(onAction);
  const wheelRef = useRef<((direction: number) => void) | undefined>(onWheel);
  const fullscreenRef = useRef<(() => void) | undefined>(onFullscreenKey);

  useEffect(() => {
    actionRef.current = onAction;
    wheelRef.current = onWheel;
    fullscreenRef.current = onFullscreenKey;
  }, [onAction, onWheel, onFullscreenKey]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "F11" || event.repeat) return;
      if (shouldIgnorePlayerHotkeys(event)) return;
      event.preventDefault();
      fullscreenRef.current?.();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useResolvedHotkeys<KeybindAction>(PLAYER_HOTKEYS, {
    ignore: (event) => shouldIgnorePlayerHotkeys(event),
    onAction: (id) => actionRef.current(id),
  });

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (shouldIgnoreHotkeys(event.target)) return;
      if (isInsideScrollable(event.target)) return;
      wheelRef.current?.(event.deltaY > 0 ? -1 : 1);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return null;
}

export default Keyboard;
