import { useEffect, useRef } from "react";

import { registerOverlay } from "@/store/overlay.store";

export function useOverlayDialog(): void {
  useEffect(() => registerOverlay(null), []);
}

export function useOverlay(dismiss: (() => void) | null, active = true): void {
  const handler = useRef<(() => void) | null>(null);
  useEffect(() => {
    handler.current = dismiss;
  }, [dismiss]);
  const registered = dismiss !== null && active;
  useEffect(() => {
    if (!registered) return;
    return registerOverlay(() => handler.current?.());
  }, [registered]);
}
