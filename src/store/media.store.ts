import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { createPersistedStoreContext } from "@/lib/core/persistence/persisted.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import type { Cell } from "@/types/core/signal";
import { attempt, attemptSync } from "@hullperse/hp_utils/attempt";
import { invokeTyped } from "@/lib/core/system/invoke.utils";
import type { MediaSignalOptions, MediaSignalStore } from "@/types/store/media";
import type { MediaEntry, WatchState } from "@/types/player/videoPlayer";

export const MEDIA_SCHEMA_VERSION = SCHEMA_VERSIONS.media;

const MAX_ENTRIES = 200;

function readMediaEntry(value: unknown): MediaEntry | null {
  if (!isRecord(value) || typeof value.path !== "string") return null;
  const number = (entry: unknown): number =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : 0;
  const optionalNumber = (entry: unknown): number | undefined =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : undefined;
  return {
    path: value.path,
    position: number(value.position),
    duration: number(value.duration),
    subOffset: number(value.subOffset),
    audioOffset: number(value.audioOffset),
    lastPlayed: number(value.lastPlayed),
    ...(optionalNumber(value.audioTrack) === undefined
      ? {}
      : { audioTrack: optionalNumber(value.audioTrack) }),
    ...(optionalNumber(value.subtitleTrack) === undefined
      ? {}
      : { subtitleTrack: optionalNumber(value.subtitleTrack) }),
  };
}

function readMediaEntries(value: unknown): MediaEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const normalized = readMediaEntry(entry);
    return normalized ? [normalized] : [];
  });
}

function touch(entries: MediaEntry[], path: string, now: number): MediaEntry[] {
  const existing = entries.find((entry) => entry.path === path);
  const rest = existing ? entries.filter((entry) => entry.path !== path) : entries;
  const entry: MediaEntry = existing
    ? { ...existing, lastPlayed: now }
    : {
        path,
        position: 0,
        duration: 0,
        subOffset: 0,
        audioOffset: 0,
        lastPlayed: now,
      };
  return [entry, ...rest].slice(0, MAX_ENTRIES);
}

function patchEntry(entries: MediaEntry[], path: string, patch: Partial<MediaEntry>): MediaEntry[] {
  const now = Date.now();
  return touch(entries, path, now).map((entry) =>
    entry.path === path ? { ...entry, ...patch } : entry
  );
}

function readLegacyMedia(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("mediaState"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  return {
    data: { entries: readMediaEntries(state.entries) },
    schemaVersion: MEDIA_SCHEMA_VERSION,
  };
}

export function createMediaSignalStore(options: MediaSignalOptions = {}): MediaSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "media",
    short: "media",
    schemaVersion: MEDIA_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyMedia(get),
  });

  const persisted = persistor.read();
  const initial = readMediaEntries(persisted?.data.entries);
  const mirror: Record<string, unknown> = { entries: initial };
  const raw = store.atom("entries", initial);
  const entries: Cell<MediaEntry[]> = {
    id: raw.id,
    get: raw.get,
    set: (value) => {
      mirror.entries = value;
      raw.set(value);
    },
    update: (fn) => {
      const next = fn(raw.get());
      mirror.entries = next;
      raw.set(next);
    },
    subscribe: raw.subscribe,
  };

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const getEntry = (path: string): MediaEntry | undefined =>
    entries.get().find((entry) => entry.path === path);

  const handle: MediaSignalStore = {
    entries,
    persistor,
    getEntry,
    setPosition: (path, time, duration) =>
      entries.set(
        patchEntry(entries.get(), path, {
          ...(duration === undefined ? {} : { duration }),
          position: time,
        })
      ),
    setTrack: (path, type, index) => {
      const patch = type === "audio" ? { audioTrack: index } : { subtitleTrack: index };
      entries.set(patchEntry(entries.get(), path, patch));
    },
    setSubOffset: (path, offset) =>
      entries.set(patchEntry(entries.get(), path, { subOffset: offset })),
    setAudioOffset: (path, offset) =>
      entries.set(patchEntry(entries.get(), path, { audioOffset: offset })),
    hydrate: async (path) => {
      const [stored] = await attempt(invokeTyped<WatchState | null>("player_load_watch", { path }));
      const entry = getEntry(path);
      if (!stored) return entry;
      const merged: MediaEntry = {
        path,
        position: stored.position,
        duration: stored.duration,
        subOffset: stored.subDelay ?? entry?.subOffset ?? 0,
        audioOffset: stored.audioDelay ?? entry?.audioOffset ?? 0,
        audioTrack: entry?.audioTrack,
        subtitleTrack: entry?.subtitleTrack,
        lastPlayed: entry?.lastPlayed ?? Date.now(),
      };
      entries.set(patchEntry(entries.get(), path, merged));
      return merged;
    },
    clearEntries: () => entries.set([]),
  };

  finishAdopt(() => ({ ...mirror }), { remove: "mediaState" });

  return handle;
}

const media = createMediaSignalStore();

export const mediaEntries = media.entries;
export const getMediaEntry = media.getEntry;
export const setMediaPosition = media.setPosition;
export const setMediaTrack = media.setTrack;
export const setMediaSubOffset = media.setSubOffset;
export const setMediaAudioOffset = media.setAudioOffset;
export const hydrateMediaEntry = media.hydrate;

