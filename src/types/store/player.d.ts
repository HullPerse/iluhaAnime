import type { Persistor } from "@/types/core/persist";
import type { Cell, Derived } from "@/types/core/signal";
import type {
  MpvChapter,
  MpvTrack,
  PlaybackSnapshot,
  PlaybackStore,
  PlayerSettings,
  PlayerStore,
  StreamOpen,
  TrackSeed,
} from "@/types/player/videoPlayer";

type PlayerActionKeys =
  | "setVolume"
  | "setFolderPaths"
  | "setEofMode"
  | "setHwdec"
  | "setSeekMode"
  | "setAutoHide"
  | "setAlwaysOnTop"
  | "setProfile"
  | "patchSettings";

export type PlayerData = Omit<PlayerStore, PlayerActionKeys>;

type PlayerAtoms = { [K in keyof PlayerData]: Cell<PlayerData[K]> };

type PlaybackActionKeys =
  | "setSnapshot"
  | "setSeekTarget"
  | "settleSeek"
  | "setPaused"
  | "setMuted"
  | "setPlaybackSpeed"
  | "markTrackSelected"
  | "seedTrackSelection"
  | "setTracks"
  | "setChapters"
  | "reset";

export type PlaybackData = Omit<PlaybackStore, PlaybackActionKeys>;

type PlaybackAtoms = { [K in keyof PlaybackData]-?: Cell<PlaybackData[K]> };

export interface PlayerSignalStore {
  atoms: PlayerAtoms;
  persistor: Persistor;
  snapshot: () => PlayerData;
  setVolume: (volume: number) => void;
  setFolderPaths: (paths: string[]) => void;
  setEofMode: (mode: PlayerData["eofMode"]) => void;
  setHwdec: (mode: PlayerData["hwdec"]) => void;
  setSeekMode: (mode: PlayerData["seekMode"]) => void;
  setAutoHide: (autoHide: boolean) => void;
  setAlwaysOnTop: (alwaysOnTop: boolean) => void;
  setProfile: (profile: PlayerData["profile"]) => void;
  patchPlayerSettings: (patch: Partial<PlayerSettings>) => void;
  subscribeAll: (fn: () => void) => () => void;
}

export interface PlaybackSignalStore {
  atoms: PlaybackAtoms;
  atStart: Derived<boolean>;
  atEnd: Derived<boolean>;
  streamSession: Cell<StreamOpen | null>;
  streamRequest: Cell<number>;
  beginStreamRequest: () => number;
  subscribeAll: (fn: () => void) => () => void;
  setSnapshot: (snapshot: PlaybackSnapshot) => void;
  setSeekTarget: (time: number) => void;
  settleSeek: () => void;
  setPaused: (paused: boolean) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  markTrackSelected: (kind: "audio" | "sub", id: number | "no", identity?: string) => void;
  seedTrackSelection: (seed: TrackSeed) => void;
  setTracks: (tracks: MpvTrack[]) => void;
  setChapters: (chapters: MpvChapter[]) => void;
  resetPlayback: () => void;
}
