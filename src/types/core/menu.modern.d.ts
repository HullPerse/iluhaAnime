import type {
  EndOfFileMode,
  MpvChapter,
  MpvTrack,
  PlayerCabinetId,
  PlayerModeId,
  PlayerViewMode,
  StreamOpen,
} from "@/types/player/videoPlayer";
import type { StreamVariant } from "@/types/player/stream";

export interface ModernMenuStream {
  session: StreamOpen;
  /** Every row of the episode, voice-overs and subtitle translations alike. */
  variants: StreamVariant[];
  variantsLoading: boolean;
  variantsFailed: boolean;
  switching: boolean;
}

export interface ModernMenuSnapshot {
  hasFile: boolean;
  paused: boolean;
  tracks: MpvTrack[];
  chapters: MpvChapter[];
  playlistOpen: boolean;
  fullscreen: boolean;
  viewMode: PlayerViewMode;
  alwaysOnTop: boolean;
  speed: number;
  eofMode: EndOfFileMode;
  playerMode: PlayerModeId;
  cabinet: PlayerCabinetId;
  /** Present only while a streaming session is playing. */
  stream: ModernMenuStream | null;
}

export interface ModernMenuActions {
  onPlayPause: () => void;
  onFrameStep: (forward: boolean) => void;
  onPrevFile: () => void;
  onNextFile: () => void;
  onSelectAudio: (id: number | "no") => void;
  onSelectSub: (id: number | "no") => void;
  onSeekTo: (time: number) => void;
  onSpeed: (value: number) => void;
  onTogglePlaylist: () => void;
  onToggleFullscreen: () => void;
  onViewMode: (mode: PlayerViewMode) => void;
  onToggleAlwaysOnTop: () => void;
  onEofMode: (mode: EndOfFileMode) => void;
  onPlayerMode: (mode: PlayerModeId) => void;
  onCabinet: (cabinet: PlayerCabinetId) => void;
  onOpenSettings: () => void;
  onOpenCheatsheet: () => void;
  onSelectVariant: (variant: StreamVariant) => void;
  onSelectQuality: (label: string) => void;
  onRetryVariants: () => void;
}
