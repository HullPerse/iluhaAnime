import { useCallback, useEffect, useRef, useState } from "react";

import { AUTO_HIDE_DELAY, DROP_TOAST_TIMEOUT } from "@/config/player/playbackTiming.config";
import { Debouncer } from "@/lib/core/debounce.utils";
import type { DroppedFramesData } from "@/types/player/videoPlayer";

export function useBarsAutoHide(enabled: boolean, setBarsVisible: (value: boolean) => void): void {
  useEffect(() => {
    if (!enabled) {
      setBarsVisible(true);
      return;
    }
    const hide = new Debouncer<[]>(() => setBarsVisible(false), { wait: AUTO_HIDE_DELAY });
    hide.maybeExecute();
    const wake = () => {
      setBarsVisible(true);
      hide.maybeExecute();
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      hide.cancel();
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, [enabled, setBarsVisible]);
}

export function useDropAlert() {
  const [dropAlert, setDropAlert] = useState<DroppedFramesData | null>(null);
  const dropHideRef = useRef<Debouncer<[]> | null>(null);

  const showDropAlert = useCallback((data: DroppedFramesData) => {
    setDropAlert(data);
    if (dropHideRef.current === null) {
      dropHideRef.current = new Debouncer(() => setDropAlert(null), {
        wait: DROP_TOAST_TIMEOUT,
      });
    }
    dropHideRef.current.maybeExecute();
  }, []);

  useEffect(() => {
    return () => dropHideRef.current?.cancel();
  }, []);

  return { dropAlert, showDropAlert };
}
