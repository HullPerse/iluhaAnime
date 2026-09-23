import { useEffect, useRef } from "react";

import { useOverlayStore } from "@/store/overlay.store";

export function useOverlayDialog(): void {
  const register = useOverlayStore((state) => state.register);
  useEffect(() => register(null), [register]);
}

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
