import { useCallback, useRef, useState } from "react";

import { useBarsAutoHide } from "@/hooks/player/chromeState.hook";
import { useWindowControls } from "@/hooks/player/windowControls.hook";
import { useWindowDrag } from "@/hooks/player/windowDrag.hook";
import { resolveViewChrome } from "@/lib/core/ui/view.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { playerAtoms, setAutoHide } from "@/store/player.store";
import type { PlayerViewMode } from "@/types/player/videoPlayer";

interface PlayerViewChromeDeps {
  autoHide: boolean;
  menuOpen: boolean;
  closeOverlay: () => boolean;
}

export function usePlayerViewChrome({ autoHide, menuOpen, closeOverlay }: PlayerViewChromeDeps) {
  const [cinema, setCinema] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<PlayerViewMode>("normal");
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [barsVisible, setBarsVisible] = useState<boolean>(true);

  const chrome = resolveViewChrome({
    mode: viewMode,
    cinema,
    fullscreen,
    autoHide,
    barsVisible,
    menuOpen,
  });
  const immersive = chrome.fullBleed;

  useBarsAutoHide(chrome.barsAutoHide, setBarsVisible);

  const { toggleFullscreen, applyViewMode, toggleCinema, applyAlwaysOnTop, exitCinemaMode } =
    useWindowControls({
      cinema,
      closeOverlay,
      fullscreen,
      setCinema,
      setFullscreen,
      setViewMode,
      viewMode,
    });

  const autoHideBeforeFullscreen = useRef<boolean | null>(null);
  const onFullscreenKey = useCallback(() => {
    if (fullscreen) {
      const restore = autoHideBeforeFullscreen.current;
      autoHideBeforeFullscreen.current = null;
      if (restore !== null) setAutoHide(restore);
    } else {
      autoHideBeforeFullscreen.current = playerAtoms.autoHide.get();
      if (!playerAtoms.autoHide.get()) setAutoHide(true);
    }
    ignore(toggleFullscreen());
  }, [fullscreen, toggleFullscreen]);

  const {
    onMouseDown: onVideoMouseDown,
    onMouseMove: onVideoMouseMove,
    onMouseUp: onVideoMouseUp,
    consumeDrag: consumeVideoDrag,
  } = useWindowDrag(!chrome.showHeader);

  return {
    cinema,
    viewMode,
    fullscreen,
    chrome,
    immersive,
    barsHidden: chrome.barsHidden,
    toggleFullscreen,
    applyViewMode,
    toggleCinema,
    applyAlwaysOnTop,
    exitCinemaMode,
    onFullscreenKey,
    onVideoMouseDown,
    onVideoMouseMove,
    onVideoMouseUp,
    consumeVideoDrag,
  };
}
