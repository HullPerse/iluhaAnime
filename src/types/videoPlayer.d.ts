export interface PlayerOpenRequest {
  files: string[];
  resume?: number;
}

export interface PlaybackSnapshot {
  timePos: number;
  duration: number;
  pause: boolean;
  eofReached: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  playlistIndex: number;
  playlistCount: number;
  path: string;
  fpsRender?: number;
  fpsVideo?: number;
  dropCount?: number;
  cacheDuration?: number;
  hwdecCurrent?: string;
  videoWidth?: number;
  videoHeight?: number;
}

export type PlaybackEventKind =
  | "file-loaded"
  | "end-file"
  | "idle"
  | "shutdown"
  | "seek"
  | "playback-restart"
  | "error"
  | "video-reconfig"
  | "audio-reconfig"
  | "dropped-frames";

export interface PlaybackEvent {
  kind: PlaybackEventKind;
  reason?: string;
  data?: unknown;
}

export interface DroppedFramesData {
  drops: number;
  expectedFrames: number;
  ratio: number;
  fps: number;
}

export interface MpvTrack {
  id: number;
  type: "video" | "audio" | "sub";
  title?: string;
  lang?: string;
  codec?: string;
  "demux-w"?: number;
  "demux-h"?: number;
  "demux-channels"?: string;
  "demux-samplerate"?: number;
  default?: boolean;
  forced?: boolean;
  external?: boolean;
  selected?: boolean;
  "external-filename"?: string;
}

export interface MpvChapter {
  title: string;
  time: number;
  end?: number;
}

export interface WatchState {
  position: number;
  duration: number;
  audioDelay?: number;
  subDelay?: number;
  updatedAt: number;
}

export interface MediaEntry {
  path: string;
  position: number;
  duration: number;
  subOffset: number;
  audioOffset: number;
  audioTrack?: number;
  subtitleTrack?: number;
  lastPlayed: number;
}

export type EndOfFileMode = "none" | "pause" | "next" | "repeat";

export type HwdecMode = "auto-safe" | "d3d11va" | "cuda" | "no";

export type PlayerProfileId = "basic" | "speed" | "quality";

export interface PlayerProfile {
  id: PlayerProfileId;
  labelKey: string;
  options: Record<string, string | number | boolean>;
}

export type SeekMode = "keyframes" | "exact";

export interface PlayerSettings {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
  aspectRatio: "contain" | "fill" | "cover" | "none" | "scale-down";
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  gamma: number;
  blur: number;
  sepia: number;
  grayscale: number;
  subFontSize: number;
  subFontFamily: string;
  subColor: string;
  subBgOpacity: number;
  subBgColor: string;
  toneMap: "auto" | "manual";
  targetPeak: number;
  hdrComputePeak: boolean;
  targetPrim: "auto" | "bt.709" | "bt.2020" | "dci-p3" | "display-p3";
  targetTrc: "auto" | "bt.1886" | "srgb" | "linear" | "gamma2.2" | "pq" | "hlg";
  loudnorm: boolean;
}

export type PlayerPanel =
  | "none"
  | "settings"
  | "tracks"
  | "subtitles"
  | "cheatsheet"
  | "jump";

export interface PlayerOsd {
  id: number;
  text: string;
}

export interface VideoMarginRatio {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface PlayerStore {
  volume: number;
  folderPaths: string[];
  eofMode: EndOfFileMode;
  hwdec: HwdecMode;
  seekMode: SeekMode;
  autoHide: boolean;
  profile: PlayerProfileId;
  settings: PlayerSettings;
  setVolume: (volume: number) => void;
  setFolderPaths: (paths: string[]) => void;
  setEofMode: (mode: EndOfFileMode) => void;
  setHwdec: (mode: HwdecMode) => void;
  setSeekMode: (mode: SeekMode) => void;
  setAutoHide: (autoHide: boolean) => void;
  setProfile: (profile: PlayerProfileId) => void;
  patchSettings: (patch: Partial<PlayerSettings>) => void;
}

export interface PlaybackStore {
  ready: boolean;
  hasFile: boolean;
  timePos: number;
  duration: number;
  paused: boolean;
  eofReached: boolean;
  speed: number;
  muted: boolean;
  playlistIndex: number;
  playlistCount: number;
  path: string;
  tracks: MpvTrack[];
  chapters: MpvChapter[];
  seekTarget: number | null;
  seekSettle: boolean;
  fpsRender?: number;
  fpsVideo?: number;
  dropCount?: number;
  cacheDuration?: number;
  hwdecCurrent?: string;
  videoWidth?: number;
  videoHeight?: number;
  setSnapshot: (snapshot: PlaybackSnapshot) => void;
  setTracks: (tracks: MpvTrack[]) => void;
  setChapters: (chapters: MpvChapter[]) => void;
  setSeekTarget: (time: number) => void;
  settleSeek: () => void;
  reset: () => void;
}

export interface MediaStore {
  entries: MediaEntry[];
  getEntry: (path: string) => MediaEntry | undefined;
  setPosition: (path: string, time: number, duration?: number) => void;
  setTrack: (path: string, type: "audio" | "sub", index: number) => void;
  setSubOffset: (path: string, offset: number) => void;
  setAudioOffset: (path: string, offset: number) => void;
  hydrate: (path: string) => Promise<MediaEntry | undefined>;
  clearEntries: () => void;
}
