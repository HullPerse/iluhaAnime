import { DEFAULT_VOLUME } from "@/config/player/video.config";
import { createPersistedStoreContext } from "@/lib/state/persisted.utils";
import type { Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import type {
  MpvChapter,
  MpvTrack,
  PlaybackSnapshot,
  PlaybackStore,
  PlayerSettings,
  PlayerStore,
} from "@/types/videoPlayer";
import { attemptSync } from "@/lib/utils/attempt.utils";

export const PLAYER_SCHEMA_VERSION = 0;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  rotation: 0,
  flipH: false,
  flipV: false,
  zoom: 1,
  aspectRatio: "contain",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  subFontSize: 18,
  subFontFamily: "Arial",
  subColor: "#ffffff",
  subBgOpacity: 0,
  subBgColor: "#000000",
  toneMap: "auto",
  targetPeak: 1000,
  hdrComputePeak: false,
  targetPrim: "auto",
  targetTrc: "auto",
  loudnorm: false,
};

type PlayerActionKeys =
  | "setVolume"
  | "setFolderPaths"
  | "setEofMode"
  | "setHwdec"
  | "setSeekMode"
  | "setAutoHide"
  | "setProfile"
  | "patchSettings";

export type PlayerData = Omit<PlayerStore, PlayerActionKeys>;
export type PlayerAtoms = { [K in keyof PlayerData]: Cell<PlayerData[K]> };

type PlaybackActionKeys =
  | "setSnapshot"
  | "setSeekTarget"
  | "settleSeek"
  | "setPaused"
  | "setMuted"
  | "setPlaybackSpeed"
  | "markTrackSelected"
  | "setTracks"
  | "setChapters"
  | "reset";

export type PlaybackData = Omit<PlaybackStore, PlaybackActionKeys>;
export type PlaybackAtoms = { [K in keyof PlaybackData]-?: Cell<PlaybackData[K]> };

const INITIAL_PLAYBACK: PlaybackData = {
  ready: false,
  hasFile: false,
  timePos: 0,
  duration: 0,
  paused: true,
  eofReached: false,
  speed: 1,
  muted: false,
  playlistIndex: -1,
  playlistCount: 0,
  path: "",
  tracks: [],
  chapters: [],
  seekTarget: null,
  seekSettle: false,
  fpsRender: undefined,
  fpsVideo: undefined,
  dropCount: undefined,
  cacheDuration: undefined,
  hwdecCurrent: undefined,
  videoWidth: undefined,
  videoHeight: undefined,
} as PlaybackData;

const SEEK_TARGET_TOLERANCE = 0.4;
const SEEK_TARGET_CONFIRMATIONS = 2;
const SEEK_TARGET_RESET_MS = 2500;

const DEFAULT_PLAYER_DATA: PlayerData = {
  volume: DEFAULT_VOLUME,
  folderPaths: [],
  eofMode: "none",
  hwdec: "auto-safe",
  seekMode: "keyframes",
  autoHide: false,
  profile: "basic",
  settings: { ...DEFAULT_PLAYER_SETTINGS },
};

function buildAtoms(
  store: ReturnType<typeof createSignalStore>,
  data: PlayerData,
  mirror: Record<string, unknown>
): PlayerAtoms {
  const atoms = {} as PlayerAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const cell = store.atom(key, source[key]);
    const handle: Cell<unknown> = {
      id: cell.id,
      get: cell.get,
      set: (value) => {
        mirror[key] = value;
        cell.set(value);
      },
      update: (fn) => {
        const next = (fn as (prev: unknown) => unknown)(cell.get());
        mirror[key] = next;
        cell.set(next);
      },
      subscribe: cell.subscribe,
    };
    sink[key] = handle;
  }
  return atoms;
}

function buildPlaybackAtoms(
  store: ReturnType<typeof createSignalStore>,
  data: PlaybackData
): PlaybackAtoms {
  const atoms = {} as PlaybackAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    sink[key] = store.atom(key, source[key]);
  }
  return atoms;
}

function readLegacyPlayer(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("playerState"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown };
  const stored = (
    envelope.state && typeof envelope.state === "object" ? envelope.state : parsed
  ) as Partial<PlayerData>;
  return {
    data: {
      ...DEFAULT_PLAYER_DATA,
      ...stored,
      settings: { ...DEFAULT_PLAYER_DATA.settings, ...stored.settings },
    } as Record<string, unknown>,
    schemaVersion: PLAYER_SCHEMA_VERSION,
  };
}

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
  setProfile: (profile: PlayerData["profile"]) => void;
  patchPlayerSettings: (patch: Partial<PlayerSettings>) => void;
  subscribeAll: (fn: () => void) => () => void;
}

export interface PlayerSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export function createPlayerSignalStore(options: PlayerSignalOptions = {}): PlayerSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "player",
    short: "player",
    schemaVersion: PLAYER_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyPlayer(get),
  });

  const persisted = persistor.read();
  const data: PlayerData = persisted
    ? { ...DEFAULT_PLAYER_DATA, ...(persisted.data as Partial<PlayerData>) }
    : { ...DEFAULT_PLAYER_DATA };
  const mirror: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  const atoms = buildAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const handle: PlayerSignalStore = {
    atoms,
    persistor,
    snapshot: () => ({ ...mirror }) as PlayerData,
    subscribeAll: (fn) => store.subscribeAll(fn),
    setVolume: (volume) => atoms.volume.set(Math.min(1, Math.max(0, volume))),
    setFolderPaths: (paths) => atoms.folderPaths.set(paths),
    setEofMode: (mode) => atoms.eofMode.set(mode),
    setHwdec: (mode) => atoms.hwdec.set(mode),
    setSeekMode: (mode) => atoms.seekMode.set(mode),
    setAutoHide: (autoHide) => atoms.autoHide.set(autoHide),
    setProfile: (profile) => atoms.profile.set(profile),
    patchPlayerSettings: (patch) =>
      atoms.settings.set({ ...atoms.settings.get(), ...patch }),
  };

  finishAdopt(() => ({ ...mirror }), { remove: "playerState" });

  return handle;
}

export interface PlaybackSignalStore {
  atoms: PlaybackAtoms;
  subscribeAll: (fn: () => void) => () => void;
  setSnapshot: (snapshot: PlaybackSnapshot) => void;
  setSeekTarget: (time: number) => void;
  settleSeek: () => void;
  setPaused: (paused: boolean) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  markTrackSelected: (kind: "audio" | "sub", id: number | "no") => void;
  setTracks: (tracks: MpvTrack[]) => void;
  setChapters: (chapters: MpvChapter[]) => void;
  resetPlayback: () => void;
}

export function createPlaybackSignalStore(): PlaybackSignalStore {
  const store = createSignalStore();
  const atoms = buildPlaybackAtoms(store, { ...INITIAL_PLAYBACK });

  let seekResetTimer: ReturnType<typeof setTimeout> | undefined;
  let seekConfirm = 0;
  const armSeekReset = (): void => {
    if (seekResetTimer !== undefined) clearTimeout(seekResetTimer);
    seekResetTimer = setTimeout(() => {
      seekResetTimer = undefined;
      seekConfirm = 0;
      if (atoms.seekTarget.get() !== null) {
        atoms.seekTarget.set(null);
        atoms.seekSettle.set(false);
      }
    }, SEEK_TARGET_RESET_MS);
  };

  const nextSeekTarget = (snapshot: PlaybackSnapshot): number | null => {
    const seekTarget = atoms.seekTarget.get();
    if (seekTarget === null) {
      seekConfirm = 0;
      return null;
    }
    const fileChanged = snapshot.path !== atoms.path.get();
    if (atoms.seekSettle.get() || fileChanged) {
      seekConfirm = 0;
      return null;
    }
    const reached = Math.abs(snapshot.timePos - seekTarget) <= SEEK_TARGET_TOLERANCE;
    if (!reached) {
      seekConfirm = 0;
      return seekTarget;
    }
    // Hysteresis: a single in-tolerance sample can be a stale or rebuffer
    // reading, so the optimistic target drops only after consecutive
    // confirmations. Otherwise the timeline flickers around the drop point.
    seekConfirm += 1;
    if (seekConfirm >= SEEK_TARGET_CONFIRMATIONS) {
      seekConfirm = 0;
      return null;
    }
    return seekTarget;
  };

  return {
    atoms,
    subscribeAll: (fn) => store.subscribeAll(fn),
    setSnapshot: (snapshot) => {
      const seekTarget = nextSeekTarget(snapshot);
      store.batch(() => {
        atoms.ready.set(true);
        atoms.hasFile.set(snapshot.path !== "");
        atoms.timePos.set(snapshot.timePos);
        atoms.duration.set(snapshot.duration);
        atoms.paused.set(snapshot.pause);
        atoms.eofReached.set(snapshot.eofReached);
        atoms.speed.set(snapshot.speed);
        atoms.muted.set(snapshot.muted);
        atoms.playlistIndex.set(snapshot.playlistIndex);
        atoms.playlistCount.set(snapshot.playlistCount);
        atoms.path.set(snapshot.path);
        atoms.fpsRender.set(snapshot.fpsRender);
        atoms.fpsVideo.set(snapshot.fpsVideo);
        atoms.dropCount.set(snapshot.dropCount);
        atoms.cacheDuration.set(snapshot.cacheDuration);
        atoms.hwdecCurrent.set(snapshot.hwdecCurrent);
        atoms.videoWidth.set(snapshot.videoWidth);
        atoms.videoHeight.set(snapshot.videoHeight);
        atoms.seekTarget.set(seekTarget);
        atoms.seekSettle.set(seekTarget === null ? false : atoms.seekSettle.get());
      });
    },
    setSeekTarget: (time) => {
      armSeekReset();
      seekConfirm = 0;
      atoms.seekTarget.set(time);
      atoms.seekSettle.set(false);
    },
    settleSeek: () => {
      const target = atoms.seekTarget.get();
      if (target === null) return;
      // Settle only against a fresh position: a playback-restart from an
      // older seek can arrive after a newer target was issued, and settling
      // then would drop the optimistic target while timePos is still stale —
      // the timeline would jump back until fresh snapshots arrive.
      if (Math.abs(atoms.timePos.get() - target) <= SEEK_TARGET_TOLERANCE) {
        atoms.seekSettle.set(true);
      }
    },
    setPaused: (paused) => atoms.paused.set(paused),
    setMuted: (muted) => atoms.muted.set(muted),
    setPlaybackSpeed: (speed) => atoms.speed.set(speed),
    markTrackSelected: (kind, id) => {
      const tracks = atoms.tracks.get();
      atoms.tracks.set(
        tracks.map((track) =>
          track.type === kind ? { ...track, selected: id === "no" ? false : track.id === id } : track
        )
      );
    },
    setTracks: (tracks) => atoms.tracks.set(tracks),
    setChapters: (chapters) => atoms.chapters.set(chapters),
    resetPlayback: () => {
      const fresh = { ...INITIAL_PLAYBACK };
      const target = atoms as unknown as Record<string, Cell<unknown>>;
      const source = fresh as unknown as Record<string, unknown>;
      seekConfirm = 0;
      store.batch(() => {
        for (const key of Object.keys(source)) {
          target[key].set(source[key]);
        }
      });
    },
  };
}

const player = createPlayerSignalStore();
const playback = createPlaybackSignalStore();

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => player.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") player.persistor.flush();
  });
}

export const playerAtoms = player.atoms;
export const playerPersistor = player.persistor;
export const getPlayerSnapshot = player.snapshot;
export function subscribePlayer(listener: () => void): () => void {
  return player.subscribeAll(listener);
}
export const setVolume = player.setVolume;
export const setFolderPaths = player.setFolderPaths;
export const setEofMode = player.setEofMode;
export const setHwdec = player.setHwdec;
export const setSeekMode = player.setSeekMode;
export const setAutoHide = player.setAutoHide;
export const setProfile = player.setProfile;
export const patchPlayerSettings = player.patchPlayerSettings;

export const playbackAtoms = playback.atoms;
export function subscribePlayback(listener: () => void): () => void {
  return playback.subscribeAll(listener);
}
export const setPlaybackSnapshot = playback.setSnapshot;
export const setSeekTarget = playback.setSeekTarget;
export const settleSeek = playback.settleSeek;
export const setPlaybackPaused = playback.setPaused;
export const setPlaybackMuted = playback.setMuted;
export const setPlaybackSpeed = playback.setPlaybackSpeed;
export const markTrackSelected = playback.markTrackSelected;
export const setPlaybackTracks = playback.setTracks;
export const setPlaybackChapters = playback.setChapters;
export const resetPlayback = playback.resetPlayback;
