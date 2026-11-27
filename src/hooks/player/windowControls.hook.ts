import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";

import { attempt, reportBackgroundError, withFallback } from "@hullperse/hp_utils/attempt";
import { translate } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";
import { ignore } from "@/lib/core/shared/promise.utils";
import { playerAtoms, setAlwaysOnTop } from "@/store/player.store";
import type { PlayerViewMode } from "@/types/player/videoPlayer";

interface WindowControlDeps {
  fullscreen: boolean;
  viewMode: PlayerViewMode;
  cinema: boolean;
  setFullscreen: (value: boolean) => void;
  setViewMode: (mode: PlayerViewMode) => void;
  setCinema: (value: boolean) => void;
  closeOverlay: () => boolean;
}

export function useWindowControls({
  fullscreen,
  viewMode,
  cinema,
  setFullscreen,
  setViewMode,
  setCinema,
  closeOverlay,
}: WindowControlDeps) {
  const pinPendingRef = useRef(false);
  const applyAlwaysOnTop = useCallback((value: boolean) => {
    if (pinPendingRef.current) return;
    pinPendingRef.current = true;
    ignore(
      (async () => {
        const [, failure] = await attempt(getCurrentWindow().setAlwaysOnTop(value));
        pinPendingRef.current = false;

        if (failure) {
          reportBackgroundError("player.window.pin", failure);
          addNotification(translate("player.media.pin.failed"), "error", failure.message);

          return;
        }

        setAlwaysOnTop(value);
      })()
    );
  }, []);
  useEffect(() => {
    const win = getCurrentWindow();
    ignore(win.isFullscreen().then(setFullscreen));
  }, [setFullscreen]);

  useEffect(() => {
    applyAlwaysOnTop(playerAtoms.alwaysOnTop.get());
  }, [applyAlwaysOnTop]);

  const toggleFullscreen = useCallback(async () => {
    const win = getCurrentWindow();
    const next = !(await withFallback(win.isFullscreen(), fullscreen));
    await withFallback(win.setFullscreen(next), undefined);
    setFullscreen(next);
  }, [fullscreen, setFullscreen]);

  const applyViewMode = useCallback(
    (mode: PlayerViewMode) => {
      setViewMode(mode);

      if (mode !== "normal") setCinema(false);
    },
    [setCinema, setViewMode]
  );

  const toggleCinema = useCallback(() => {
    setCinema(!cinema);
  }, [cinema, setCinema]);

  const exitCinemaMode = useCallback(() => {
    if (closeOverlay()) return;
    ignore(
      getCurrentWindow()
        .isFullscreen()
        .then(async (isFull) => {
          if (isFull) {
            await getCurrentWindow().setFullscreen(false);
            setFullscreen(false);
          } else if (viewMode !== "normal") {
            setViewMode("normal");
          } else if (cinema) {
            setCinema(false);
          }

          return null;
        })
    );
  }, [cinema, closeOverlay, setCinema, setFullscreen, setViewMode, viewMode]);

  return { toggleFullscreen, applyViewMode, toggleCinema, applyAlwaysOnTop, exitCinemaMode };
}
