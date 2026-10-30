import type { DroppedFramesData, PlayerOpenRequest } from "@/types/player/videoPlayer";

export interface PlayerEventHandlers {
  onOpenRequest?: (request: PlayerOpenRequest) => void;
  onFileLoaded?: () => void;
  onEndFile?: (reason: string) => void;
  onPlaybackRestart?: () => void;
  onIdle?: () => void;
  onShutdown?: () => void;
  onError?: () => void;
  onDroppedFrames?: (data: DroppedFramesData) => void;
}
