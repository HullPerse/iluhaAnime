import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { DEFAULT_VOLUME } from "@/config/player/video.config";
import { Debouncer } from "@hullperse/hp_utils/debounce";
import {
  applyAtomValues,
  buildMirrorAtoms,
  buildSignalAtoms,
  createPersistedStoreContext,
} from "@/lib/core/persistence/persisted.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import type { Cell } from "@/types/core/signal";
import { resolveWithDefaults } from "@/lib/core/persistence/migrate.utils";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import { resolveTrackId } from "@/lib/player/trackIdentity.utils";
import type { SignalStoreOptions } from "@/types/store/options";
import type {
  PlaybackData,
  PlaybackSignalStore,
  PlayerData,
  PlayerSignalStore,
} from "@/types/store/player";
import type {
  MpvTrack,
  PlaybackSnapshot,
  PlayerSettings,
  StreamOpen,
  TrackSeed,
} from "@/types/player/videoPlayer";

export const PLAYER_SCHEMA_VERSION = SCHEMA_VERSIONS.player;

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

const INITIAL_PLAYBACK: PlaybackData = {
  ready: false,
  hasFile: false,
  timePos: 0,
  duration: 0,
  durationHint: 0,
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
  cacheStart: undefined,
  cacheEnd: undefined,
  cacheIdle: undefined,
  seekableRanges: undefined,
  pausedForCache: undefined,
  hwdecCurrent: undefined,
  videoWidth: undefined,
  videoHeight: undefined,
};

const SEEK_TARGET_TOLERANCE = 0.4;
const SEEK_TARGET_CONFIRMATIONS = 2;
const SEEK_TARGET_RESET_MS = 2500;
// Watch metadata and mpv often disagree by a frame or two. Keeping the
// metadata value in that window avoids a visible jolt when duration arrives.
const DURATION_HINT_TOLERANCE = 1.5;

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

function readLegacyPlayer(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("playerState"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const stored = isRecord(parsed.state) ? parsed.state : parsed;
  return {
    data: { ...migratePlayerData(stored) },
    schemaVersion: PLAYER_SCHEMA_VERSION,
  };
}

function migratePlayerData(persistedState: unknown): PlayerData {
  if (!isRecord(persistedState)) return { ...DEFAULT_PLAYER_DATA };
  const resolved = resolveWithDefaults(persistedState, { ...DEFAULT_PLAYER_DATA });
  return { ...DEFAULT_PLAYER_DATA, ...resolved };
}

export function createPlayerSignalStore(options: SignalStoreOptions = {}): PlayerSignalStore {
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
  const mirror: Record<string, unknown> = { ...data };
  const atoms = buildMirrorAtoms(store, data, mirror);

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

function setIfChanged<T>(atom: Cell<T>, value: T): void {
  if (!Object.is(atom.get(), value)) atom.set(value);
}

export function createPlaybackSignalStore(): PlaybackSignalStore {
  const store = createSignalStore();
  const atoms = buildSignalAtoms(store, { ...INITIAL_PLAYBACK });
  const atStart = store.derive([atoms.timePos], ([timePos]) => (timePos as number) === 0);
  const atEnd = store.derive(
    [atoms.timePos, atoms.duration, atoms.durationHint],
    ([timePos, duration, hint]) => {
      const total = (duration as number) > 0 ? (duration as number) : (hint as number);
      return total > 0 && timePos === total;
    }
  );

  let trackSeed: TrackSeed | null = null;
  const seededTracks = (tracks: MpvTrack[]): MpvTrack[] => {
    if (!trackSeed) return tracks;
    const { audioTrack, audioTrackKey, subtitleTrack, subtitleTrackKey } = trackSeed;
    // If the stored id is absent (for example external sidecar ids moved),
    // leave mpv's choice alone instead of showing every row unselected.
    const audioId = resolveTrackId(tracks, "audio", audioTrack, audioTrackKey);
    const subId = resolveTrackId(tracks, "sub", subtitleTrack === "no" ? undefined : subtitleTrack, subtitleTrackKey);
    const audioExists =
      audioId !== undefined && tracks.some((track) => track.type === "audio" && track.id === audioId);
    const subExists =
      subId !== undefined && tracks.some((track) => track.type === "sub" && track.id === subId);
    return tracks.map((track) => {
      if (track.type === "audio" && audioExists) {
        return { ...track, selected: track.id === audioId };
      }
      if (track.type === "sub") {
        if (subtitleTrack === "no") return { ...track, selected: false };
        if (subExists) return { ...track, selected: track.id === subId };
      }
      return track;
    });
  };

  const streamSession = store.atom<StreamOpen | null>("playback.streamSession", null);
  const streamRequest = store.atom("playback.streamRequest", 0);

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
      const hint = atoms.durationHint.get();
      const keepHint =
        snapshot.duration > 0 &&
        hint > 0 &&
        Math.abs(snapshot.duration - hint) <= DURATION_HINT_TOLERANCE;
      const nextDuration =
        pinned && snapshot.duration <= 0
          ? atoms.duration.get()
          : keepHint
            ? hint
            : snapshot.duration;
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
        setIfChanged(atoms.cacheStart, snapshot.cacheStart);
        setIfChanged(atoms.cacheEnd, snapshot.cacheEnd);
        setIfChanged(atoms.cacheIdle, snapshot.cacheIdle);
        setIfChanged(atoms.seekableRanges, snapshot.seekableRanges);
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
    markTrackSelected: (kind, id, identity) => {
      trackSeed ??= {};
      if (kind === "audio") {
        trackSeed.audioTrack = id === "no" ? undefined : id;
        trackSeed.audioTrackKey = id === "no" ? undefined : identity;
      } else {
        trackSeed.subtitleTrack = id;
        trackSeed.subtitleTrackKey = id === "no" ? undefined : identity;
      }
      const tracks = atoms.tracks.get();
      atoms.tracks.set(
        tracks.map((track) =>
          track.type === kind
            ? { ...track, selected: id === "no" ? false : track.id === id }
            : track
        )
      );
    },
    seedTrackSelection: (seed) => {
      const empty =
        seed.audioTrack === undefined &&
        seed.audioTrackKey === undefined &&
        seed.subtitleTrack === undefined &&
        seed.subtitleTrackKey === undefined;
      trackSeed = empty ? null : { ...seed };
      atoms.tracks.set(seededTracks(atoms.tracks.get()));
    },
    setTracks: (tracks) => atoms.tracks.set(seededTracks(tracks)),
    setChapters: (chapters) => atoms.chapters.set(chapters),
    resetPlayback: () => {
      streamRequest.update((value) => value + 1);
      seekConfirm = 0;
      trackSeed = null;
      store.batch(() => applyAtomValues(atoms, INITIAL_PLAYBACK));
    },
    streamSession,
    streamRequest,
    beginStreamRequest: () => {
      const next = streamRequest.get() + 1;
      streamRequest.set(next);
      return next;
    },
  };
}

const player = createPlayerSignalStore();
const playback = createPlaybackSignalStore();

export const playerAtoms = player.atoms;
export const getPlayerSnapshot = player.snapshot;
export function subscribePlayer(listener: () => void): () => void {
  return player.subscribeAll(listener);
}
export const setVolume = player.setVolume;
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
export const seedTrackSelection = playback.seedTrackSelection;
export const setPlaybackTracks = playback.setTracks;
export const setPlaybackChapters = playback.setChapters;
export const resetPlayback = playback.resetPlayback;
export const streamSession = playback.streamSession;
export const streamRequest = playback.streamRequest;
export const beginStreamRequest = playback.beginStreamRequest;

/// Duration used for timeline bounds. mpv's duration wins once it is known;
/// until then the watch-database hint keeps seeking and the timeline usable.
export function effectivePlaybackDuration(): number {
  const live = playbackAtoms.duration.get();
  return live > 0 ? live : playbackAtoms.durationHint.get();
}
