import { DEFAULT_VOLUME } from "@/config/player/video.config";
import { Debouncer } from "@/lib/core/debounce.utils";
import type { Persistor } from "@/types/core/persist";
import { createPersistedStoreContext } from "@/lib/core/persisted.utils";
import { createSignalStore } from "@/lib/core/signal.store";
import type { Cell, Derived } from "@/types/core/signal";
import { resolveWithDefaults } from "@/lib/core/migrate.utils";
import type { MigrationState } from "@/types/core/migrate";
import { attemptSync } from "@/lib/core/attempt.utils";
import type {
  MpvChapter,
  MpvTrack,
  PlaybackSnapshot,
  PlaybackStore,
  PlayerSettings,
  PlayerStore,
  StreamOpen,
} from "@/types/player/videoPlayer";

export const PLAYER_SCHEMA_VERSION = 3;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  playerMode: "normal",
  cabinet: "none",
  crtCurvature: 0.04,
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
  | "setAlwaysOnTop"
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
  streamResume: null,
  seekSettle: false,
  fpsRender: undefined,
  fpsVideo: undefined,
  dropCount: undefined,
  cacheDuration: undefined,
  cacheBufferingState: undefined,
  cacheSpeed: undefined,
  cacheBytes: undefined,
  pausedForCache: undefined,
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
  alwaysOnTop: false,
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

export function migratePlayerData(persistedState: unknown): PlayerData {
  if (!persistedState || typeof persistedState !== "object") return { ...DEFAULT_PLAYER_DATA };
  // resolving against the defaults drops keys the shape no longer has, so a stored payload from an
  // older schema cannot resurrect a removed control
  const resolved = resolveWithDefaults(
    persistedState as MigrationState,
    DEFAULT_PLAYER_DATA as unknown as MigrationState
  ) as unknown as PlayerData;
  return { ...DEFAULT_PLAYER_DATA, ...resolved };
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
  setAlwaysOnTop: (alwaysOnTop: boolean) => void;
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
    ? migratePlayerData(persisted.data)
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
    setAlwaysOnTop: (alwaysOnTop) => atoms.alwaysOnTop.set(alwaysOnTop),
    setProfile: (profile) => atoms.profile.set(profile),
    patchPlayerSettings: (patch) => atoms.settings.set({ ...atoms.settings.get(), ...patch }),
  };

  finishAdopt(() => ({ ...mirror }), { remove: "playerState" });

  return handle;
}

export interface PlaybackSignalStore {
  atoms: PlaybackAtoms;
  /** True only at the very start; flips instead of changing every tick. */
  atStart: Derived<boolean>;
  /** True only at the end; flips instead of changing every tick. */
  atEnd: Derived<boolean>;
  /**
   * The stream the window is playing, or null for local playback.
   *
   * Deliberately outside `atoms`: `setSnapshot` runs at 10 Hz from mpv and
   * must never be able to clear the session, and the session is not persisted.
   */
  streamSession: Cell<StreamOpen | null>;
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

function setIfChanged<T>(atom: Cell<T>, value: T): void {
  if (!Object.is(atom.get(), value)) atom.set(value);
}

export function createPlaybackSignalStore(): PlaybackSignalStore {
  const store = createSignalStore();
  const atoms = buildPlaybackAtoms(store, { ...INITIAL_PLAYBACK });
  // Boundary flags for controls that only need "disabled at start/end". A
  // derived cell notifies its subscribers only when the boolean flips, so
  // these do not re-render the control bar at 10 Hz.
  const atStart = store.derive([atoms.timePos], ([timePos]) => (timePos as number) === 0);
  const atEnd = store.derive(
    [atoms.timePos, atoms.duration],
    ([timePos, duration]) => (duration as number) > 0 && timePos === duration
  );

  const streamSession = store.atom<StreamOpen | null>("playback.streamSession", null);

  let seekConfirm = 0;
  const seekReset = new Debouncer(
    () => {
      seekConfirm = 0;
      if (atoms.seekTarget.get() !== null) {
        atoms.seekTarget.set(null);
        atoms.seekSettle.set(false);
      }
    },
    { wait: SEEK_TARGET_RESET_MS }
  );
  const armSeekReset = (): void => {
    seekReset.maybeExecute();
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
    seekConfirm += 1;
    if (seekConfirm >= SEEK_TARGET_CONFIRMATIONS) {
      seekConfirm = 0;
      return null;
    }
    return seekTarget;
  };

  return {
    atoms,
    atStart,
    atEnd,
    subscribeAll: (fn) => store.subscribeAll(fn),
    setSnapshot: (snapshot) => {
      const seekTarget = nextSeekTarget(snapshot);

      const pinned = atoms.streamResume.get() !== null;
      const nextDuration =
        pinned && snapshot.duration <= 0 ? atoms.duration.get() : snapshot.duration;
      const nextSeekSettle = seekTarget === null ? false : atoms.seekSettle.get();
      store.batch(() => {
        if (!atoms.ready.get()) atoms.ready.set(true);
        setIfChanged(atoms.hasFile, snapshot.path !== "");
        setIfChanged(atoms.timePos, snapshot.timePos);
        setIfChanged(atoms.duration, nextDuration);
        setIfChanged(atoms.paused, snapshot.pause);
        setIfChanged(atoms.eofReached, snapshot.eofReached);
        setIfChanged(atoms.speed, snapshot.speed);
        setIfChanged(atoms.muted, snapshot.muted);
        setIfChanged(atoms.playlistIndex, snapshot.playlistIndex);
        setIfChanged(atoms.playlistCount, snapshot.playlistCount);
        setIfChanged(atoms.path, snapshot.path);
        setIfChanged(atoms.fpsRender, snapshot.fpsRender);
        setIfChanged(atoms.fpsVideo, snapshot.fpsVideo);
        setIfChanged(atoms.dropCount, snapshot.dropCount);
        setIfChanged(atoms.cacheDuration, snapshot.cacheDuration);
        setIfChanged(atoms.cacheBufferingState, snapshot.cacheBufferingState);
        setIfChanged(atoms.cacheSpeed, snapshot.cacheSpeed);
        setIfChanged(atoms.cacheBytes, snapshot.cacheBytes);
        setIfChanged(atoms.pausedForCache, snapshot.pausedForCache);
        setIfChanged(atoms.hwdecCurrent, snapshot.hwdecCurrent);
        setIfChanged(atoms.videoWidth, snapshot.videoWidth);
        setIfChanged(atoms.videoHeight, snapshot.videoHeight);
        setIfChanged(atoms.seekTarget, seekTarget);
        setIfChanged(atoms.seekSettle, nextSeekSettle);
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
          track.type === kind
            ? { ...track, selected: id === "no" ? false : track.id === id }
            : track
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
    streamSession,
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
export const setAlwaysOnTop = player.setAlwaysOnTop;
export const setProfile = player.setProfile;
export const patchPlayerSettings = player.patchPlayerSettings;

export const playbackAtoms = playback.atoms;
export const playbackAtStart = playback.atStart;
export const playbackAtEnd = playback.atEnd;
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
export const streamSession = playback.streamSession;
