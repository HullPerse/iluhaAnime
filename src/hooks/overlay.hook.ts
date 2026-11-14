import { useEffect } from "react";

import { registerOverlay } from "@/store/overlay.store";

export function useOverlayDialog(active = true): void {
  useEffect(() => {
    if (!active) return;
    return registerOverlay(null);
  }, [active]);
}
