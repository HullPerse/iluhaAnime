import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect } from "react";

import { withFallback } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { closePlayerWindow } from "@/lib/player/playback.utils";
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
  useEffect(() => {
    const win = getCurrentWindow();
    ignore(win.isFullscreen().then(setFullscreen));
  }, [setFullscreen]);

  useEffect(() => {
    ignore(
      withFallback(getCurrentWindow().setAlwaysOnTop(playerAtoms.alwaysOnTop.get()), undefined)
    );
  }, []);

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

  const applyAlwaysOnTop = useCallback((value: boolean) => {
    setAlwaysOnTop(value);
    ignore(withFallback(getCurrentWindow().setAlwaysOnTop(value), undefined));
  }, []);

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
          } else {
            await closePlayerWindow();
          }
          return null;
        })
    );
  }, [cinema, closeOverlay, setCinema, setFullscreen, setViewMode, viewMode]);

  return { toggleFullscreen, applyViewMode, toggleCinema, applyAlwaysOnTop, exitCinemaMode };
}
