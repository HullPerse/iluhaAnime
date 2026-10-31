import type { StreamVariant } from "@/types/player/stream";

export interface PlayerOpenRequest {
  files: string[];
  resume?: number;
  startIndex?: number;
  watch?: PlaylistWatch | null;
  stream?: StreamOpen | null;
}

export interface StreamOpen {
  sourceId: string;
  sourceName: string;
  mediaId: string;
  mediaTitle: string;
  /** The catalog slug, so a history row can reopen the title without a search. */
  slug?: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  cover?: string;
  /** The AniList id the catalog matched, used for episode previews. */
  anilistId?: number | null;
  watchKey: string;
  resume?: number;
  headers: Record<string, string>;
  /** Proxy for the media request as well as the catalog calls. */
  proxyUrl?: string | null;
  quality: string;
  variantId: string;
  sources: StreamVariantSource[];
  /**
   * The episode's voice-over and subtitle rows, carried by the window that
   * already fetched them so the player does not repeat the request.
   */
  variants?: StreamVariant[];
  mediaUrl: string;
  /** Whether playback was paused when a switch replaced the media. */
  paused?: boolean;
}

export interface StreamVariantSource {
  url: string;
  type: string;
  quality: string;
  label: string;
}

// AnimeLib wire types (serialized from Rust via Tauri commands)

export interface AnimeLibAnime {
  id: string;
  title: string;
  synonyms: string[];
  cover?: string;
  banner?: string;
  description?: string;
  year?: number;
  status?: string;
  genres: string[];
  episodeCount?: number;
  anilistId?: number;
  subOrDub?: string;
  slugUrl: string;
}

export interface AnimeLibEpisode {
  id: string;
  number: number;
  title?: string;
  airDate?: string;
  duration?: number;
  cover?: string;
}

export interface AnimeLibVariant {
  id: string;
  name: string;
  language?: string;
  separateStream: boolean;
  /** The hoster name, for example `Kodik`. */
  player: string;
  /** The hoster's own player URL; empty when the site serves the row itself. */
  sourceUrl: string;
}

/** A resolved playable source for one voice-over of one episode. */
export interface StreamSource {
  variantId: string;
  quality: string;
  label: string;
  url: string;
  type: string;
  headers: Record<string, string>;
  subtitles: StreamSubtitleTrack[];
  audioTracks: StreamAudioTrack[];
}

export interface StreamSubtitleTrack {
  id: string;
  url: string;
  language: string;
  isDefault: boolean;
  headers: Record<string, string>;
}

export interface StreamAudioTrack {
  id: string;
  language: string;
  title?: string;
  default: boolean;
}

export type PlaylistWatch =
  | { kind: "torrent"; torrentId: number; saveDir: string; anchor: string }
  | { kind: "folder"; root: string; anchor: string };

export interface PlaylistInsert {
  path: string;
  index: number;
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
  cacheBufferingState?: number;
  cacheSpeed?: number;
  cacheBytes?: number;
  cacheStart?: number;
  cacheEnd?: number;
  cacheIdle?: boolean;
  seekableRanges?: { start: number; end: number }[];
  pausedForCache?: boolean;
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

export type PlayerViewMode = "minimal" | "compact" | "normal";

export type PlayerModeId = "normal" | "tv" | "monitor" | "mono" | "vhs";

export type PlayerCabinetId = "none" | "win95" | "wood";

export type PlayerBezelVariant = Exclude<PlayerCabinetId, "none">;

export type CrtCurvature = 0.02 | 0.04 | 0.07;

export interface PlayerSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  playerMode: PlayerModeId;
  cabinet: PlayerCabinetId;
  crtCurvature: CrtCurvature;
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

export type PlayerPanel = "none" | "settings" | "tracks" | "subtitles" | "cheatsheet" | "jump";

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
  alwaysOnTop: boolean;
  profile: PlayerProfileId;
  settings: PlayerSettings;
  setVolume: (volume: number) => void;
  setFolderPaths: (paths: string[]) => void;
  setEofMode: (mode: EndOfFileMode) => void;
  setHwdec: (mode: HwdecMode) => void;
  setSeekMode: (mode: SeekMode) => void;
  setAutoHide: (autoHide: boolean) => void;
  setAlwaysOnTop: (alwaysOnTop: boolean) => void;
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
  /** Position pinned while a replacement stream loads, so the timeline does not jump to 0. */
  streamResume: number | null;
  seekSettle: boolean;
  fpsRender?: number;
  fpsVideo?: number;
  dropCount?: number;
  cacheDuration?: number;
  cacheBufferingState?: number;
  cacheSpeed?: number;
  cacheBytes?: number;
  cacheStart?: number;
  cacheEnd?: number;
  cacheIdle?: boolean;
  seekableRanges?: { start: number; end: number }[];
  pausedForCache?: boolean;
  hwdecCurrent?: string;
  videoWidth?: number;
  videoHeight?: number;
  setSnapshot: (snapshot: PlaybackSnapshot) => void;
  setTracks: (tracks: MpvTrack[]) => void;
  setChapters: (chapters: MpvChapter[]) => void;
  setSeekTarget: (time: number) => void;
  settleSeek: () => void;
  setPaused: (paused: boolean) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  markTrackSelected: (kind: "audio" | "sub", id: number | "no") => void;
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
