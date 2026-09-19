import { useEffect, useRef } from "react";

import { useOverlayStore } from "@/store/overlay.store";

/**
 * Registers a dialog-based overlay (one that renders its own Escape handling, such as
 * the shared `Modal`) in the overlay stack. The stack only keeps its order, so a
 * custom overlay underneath never swallows Escape that belongs to the dialog.
 */
export function useOverlayDialog(): void {
  const register = useOverlayStore((state) => state.register);
  useEffect(() => register(null), [register]);
}

/**
 * Registers a custom overlay and gives the stack its Escape. Pass `null` as the
 * dismissal, or `active` false, to leave the stack instead of blocking the overlay below.
 */
export function useOverlay(dismiss: (() => void) | null, active = true): void {
  const register = useOverlayStore((state) => state.register);
  const handler = useRef<(() => void) | null>(null);
  useEffect(() => {
    handler.current = dismiss;
  }, [dismiss]);
  const registered = dismiss !== null && active;
  useEffect(() => {
    if (!registered) return;
    return register(() => handler.current?.());
  }, [register, registered]);
}
