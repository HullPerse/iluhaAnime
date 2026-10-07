import { useEffect, useRef } from "react";

import { PLAYER_HOTKEYS, type KeybindAction } from "@/config/player/keybinds.config";
import { useHotkeys } from "@/hooks/hotkeys.hook";
import { shouldIgnoreHotkeys } from "@/lib/hotkeys/filter.hotkeys";

function isInsideScrollable(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  if (element.closest("[data-playlist-scroll]")) return true;
  let node: HTMLElement | null = element;
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight + 1) return true;
    node = node.parentElement;
  }
  return false;
}

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

  useHotkeys<KeybindAction>(PLAYER_HOTKEYS, {
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
