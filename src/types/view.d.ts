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
