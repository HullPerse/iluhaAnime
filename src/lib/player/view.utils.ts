import type { PlayerViewMode } from "@/types/videoPlayer";

export type PlayerBottomBarKind = "full" | "slim";

export interface ViewChrome {
  fullBleed: boolean;
  showHeader: boolean;
  bottom: PlayerBottomBarKind;
  barsAutoHide: boolean;
  barsHidden: boolean;
}

export interface ViewChromeInput {
  mode: PlayerViewMode;
  cinema: boolean;
  fullscreen: boolean;
  autoHide: boolean;
  barsVisible: boolean;
  menuOpen: boolean;
}

export function resolveViewChrome(input: ViewChromeInput): ViewChrome {
  if (input.mode === "minimal") {
    return {
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: true,
      barsHidden: !input.barsVisible && !input.menuOpen,
    };
  }
  if (input.mode === "compact") {
    return {
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: false,
      barsHidden: false,
    };
  }
  // cinema is a temporary immersive toggle of the normal preset only
  const immersive = input.cinema || input.fullscreen;
  return {
    fullBleed: immersive,
    showHeader: true,
    bottom: "full",
    barsAutoHide: input.autoHide,
    barsHidden: immersive && input.autoHide && !input.barsVisible && !input.menuOpen,
  };
}
