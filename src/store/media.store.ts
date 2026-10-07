import { createPersistor, persistKey, type Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { MediaEntry, WatchState } from "@/types/videoPlayer";

export const MEDIA_SCHEMA_VERSION = 0;

const MAX_ENTRIES = 200;

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
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  if (!state || typeof state !== "object") return null;
  const entries = (state as { entries?: unknown }).entries;
  return {
    data: { entries: Array.isArray(entries) ? entries : [] },
    schemaVersion: MEDIA_SCHEMA_VERSION,
  };
}

function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export interface MediaSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface MediaSignalStore {
  entries: Cell<MediaEntry[]>;
  persistor: Persistor;
  getEntry: (path: string) => MediaEntry | undefined;
  setPosition: (path: string, time: number, duration?: number) => void;
  setTrack: (path: string, type: "audio" | "sub", index: number) => void;
  setSubOffset: (path: string, offset: number) => void;
  setAudioOffset: (path: string, offset: number) => void;
  hydrate: (path: string) => Promise<MediaEntry | undefined>;
  clearEntries: () => void;
}

export function createMediaSignalStore(options: MediaSignalOptions = {}): MediaSignalStore {
  const getStorage = options.getStorage ?? defaultGetStorage;
  const store = createSignalStore();
  let adoptedFromLegacy = false;
  const persistor = createPersistor({
    storeName: "media",
    schemaVersion: MEDIA_SCHEMA_VERSION,
    getStorage,
    debounceMs: options.debounceMs,
    fallback: () => {
      const migrated = readLegacyMedia(getStorage);
      if (migrated) adoptedFromLegacy = true;
      return migrated;
    },
    onError: (scope, error) => reportBackgroundError(`media.signal.${scope}`, error as Error),
  });

  const persisted = persistor.read();
  const rawEntries: unknown = persisted
    ? (persisted.data as { entries?: unknown }).entries
    : undefined;
  const initial: MediaEntry[] = Array.isArray(rawEntries)
    ? (rawEntries as MediaEntry[])
    : [];
  const mirror: Record<string, unknown> = { entries: initial };
  const raw = store.atom("entries", initial);
  const entries: Cell<MediaEntry[]> = {
    id: raw.id,
    get: raw.get,
    set: (value) => {
      raw.set(value);
      mirror.entries = value;
    },
    update: (fn) => {
      const next = fn(raw.get());
      raw.set(next);
      mirror.entries = next;
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

  if (adoptedFromLegacy) {
    persistor.write({ ...mirror });
    persistor.flush();
    const [storage, storageError] = attemptSync(() => getStorage());
    if (storageError !== null) reportBackgroundError("media.signal.adopt", storageError);
    else {
      const [adopted, adoptError] = attemptSync(() => storage?.getItem(persistKey("media")));
      if (adoptError !== null) reportBackgroundError("media.signal.adopt", adoptError);
      else if (adopted) {
        const [, removeError] = attemptSync(() => storage?.removeItem("mediaState"));
        if (removeError !== null) reportBackgroundError("media.signal.adopt", removeError);
      }
    }
  }

  return handle;
}

const media = createMediaSignalStore();

export const mediaEntries = media.entries;
export const mediaPersistor = media.persistor;
export const getMediaEntry = media.getEntry;
export const setMediaPosition = media.setPosition;
export const setMediaTrack = media.setTrack;
export const setMediaSubOffset = media.setSubOffset;
export const setMediaAudioOffset = media.setAudioOffset;
export const hydrateMediaEntry = media.hydrate;
export const clearMediaEntries = media.clearEntries;

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => media.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") media.persistor.flush();
  });
}
