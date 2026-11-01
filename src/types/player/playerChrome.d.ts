import type { DroppedFramesData } from "@/types/player/videoPlayer";

export interface CursorHiddenState {
  barsHidden: boolean;
  panelOpen: boolean;
  jumpOpen: boolean;
  diagnosticsOpen: boolean;
  playlistOpen: boolean;
  menuOpen: boolean;
  dropAlert: DroppedFramesData | null;
}
