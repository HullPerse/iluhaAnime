import { useEffect, useRef } from "react";

import { PLAYER_HOTKEYS } from "@/config/keybinds.config";
import type { KeybindAction } from "@/types/keybinds";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { shouldIgnoreHotkeys } from "@/lib/filterHotkeys.utils";
import { isInsideScrollable } from "@/lib/scroll.utils";

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

  useResolvedHotkeys<KeybindAction>(PLAYER_HOTKEYS, {
    ignore: (event) => shouldIgnoreHotkeys(event.target),
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
