import type { HwdecReload } from "@/types/player/resume";
import type { HwdecMode } from "@/types/player/videoPlayer";

export interface PlayerTransportOptions {
  setFinished: (value: boolean) => void;
  setLoadingFile: (value: boolean) => void;
  streamNext: { goNext: () => Promise<void> };
  streaming: boolean;
  onCycleTrack: (kind: "audio" | "sub") => void;
  hwdecReloadRef: { current: HwdecReload | null };
}

export interface PlayerTransport {
  onPlay: () => void;
  onPause: () => void;
  onPlayPause: () => void;
  onFileNext: () => void;
  onFilePrev: () => void;
  onPlayIndex: (index: number) => Promise<void>;
  onVolume: (value: number) => void;
  onMute: () => void;
  onSpeed: (value: number) => void;
  handleHwdec: (mode: HwdecMode) => void;
  onSpeedStep: (direction: number) => void;
  onFrameStep: (forward: boolean) => void;
  onCycleSub: () => void;
  restart: () => void;
  close: () => void;
}
