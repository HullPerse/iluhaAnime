import { buildMirrorAtoms, createPersistedStoreContext } from "@/lib/core/persisted.utils";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import { writeAppCache } from "@/lib/core/cache.utils";
import { moveItem } from "@/lib/core/array.utils";
import { attemptSync } from "@/lib/core/attempt.utils";
import type { CacheStore } from "@/types/core/cache";
import type { FolderNode } from "@/types/torrent/torrent";

export const CACHE_SCHEMA_VERSION = 5;

type CacheActionKeys =
  | "setEpisodeTracker"
  | "syncTorrentOrder"
  | "moveTorrentOrder"
  | "moveTorrentOrderTo"
  | "setFolderTrees"
  | "setLastSaveDir"
  | "setSeedPreference"
  | "removeSeedPreference";

type CacheData = Omit<CacheStore, CacheActionKeys>;
type CacheAtoms = { [K in keyof CacheData]: Cell<CacheData[K]> };

const DEFAULT_CACHE_DATA: CacheData = {
  episodeTracker: {},
  folderTrees: [],
  lastSaveDir: "",
  seedPreferences: {},
  torrentOrder: [],
};

function readLegacyCache(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("cache"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  if (!state || typeof state !== "object") return null;
  return { data: state as Record<string, unknown>, schemaVersion: CACHE_SCHEMA_VERSION };
}

interface CacheSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

interface CacheSignalStore {
  atoms: CacheAtoms;
  persistor: Persistor;
  setEpisodeTracker: (tracker: CacheData["episodeTracker"]) => void;
  syncTorrentOrder: (ids: number[]) => void;
  moveTorrentOrder: (id: number, neighborId: number) => void;
  moveTorrentOrderTo: (id: number, targetId: number) => void;
  setFolderTrees: (trees: { path: string; tree: FolderNode }[]) => void;
  setLastSaveDir: (dir: string) => void;
  setSeedPreference: (id: number, enabled: boolean) => void;
  removeSeedPreference: (id: number) => void;
}

function createCacheSignalStore(options: CacheSignalOptions = {}): CacheSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "cache",
    short: "cache",
    schemaVersion: CACHE_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyCache(get),
  });

  const persisted = persistor.read();
  const persistedData = (persisted?.data ?? {}) as Partial<CacheData>;
  const data: CacheData = { ...DEFAULT_CACHE_DATA, ...persistedData };
  const mirror: Record<string, unknown> = { ...data };
  const atoms = buildMirrorAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const handle: CacheSignalStore = {
    atoms,
    persistor,
    setEpisodeTracker: (tracker) => {
      writeAppCache("player", "episodeTracker", tracker);
      atoms.episodeTracker.set(tracker);
    },
    syncTorrentOrder: (ids) => {
      const torrentOrder = atoms.torrentOrder.get();
      const known = new Set(ids);
      const kept = torrentOrder.filter((id) => known.has(id));
      const missing = [...ids].filter((id) => !torrentOrder.includes(id)).sort((a, b) => a - b);
      const next = [...kept, ...missing];
      if (
        next.length === torrentOrder.length &&
        next.every((id, index) => id === torrentOrder[index])
      )
        return;
      writeAppCache("torrent", "torrentOrder", next);
      atoms.torrentOrder.set(next);
    },
    moveTorrentOrder: (id, neighborId) => {
      const torrentOrder = atoms.torrentOrder.get();
      const from = torrentOrder.indexOf(id);
      const to = torrentOrder.indexOf(neighborId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...torrentOrder];
      [next[from], next[to]] = [next[to], next[from]];
      writeAppCache("torrent", "torrentOrder", next);
      atoms.torrentOrder.set(next);
    },
    moveTorrentOrderTo: (id, targetId) => {
      const torrentOrder = atoms.torrentOrder.get();
      const from = torrentOrder.indexOf(id);
      const to = torrentOrder.indexOf(targetId);
      if (from === -1 || to === -1) return;
      const next = moveItem(torrentOrder, from, to);
      if (next === torrentOrder) return;
      writeAppCache("torrent", "torrentOrder", next);
      atoms.torrentOrder.set(next);
    },
    setFolderTrees: (trees) => {
      writeAppCache("player", "folderTrees", trees);
      atoms.folderTrees.set(trees);
    },
    setLastSaveDir: (dir) => {
      writeAppCache("torrent", "lastSaveDir", dir);
      atoms.lastSaveDir.set(dir);
    },
    setSeedPreference: (id, enabled) => {
      const seedPreferences = { ...atoms.seedPreferences.get(), [id]: enabled };
      writeAppCache("torrent", "seedPreferences", seedPreferences);
      atoms.seedPreferences.set(seedPreferences);
    },
    removeSeedPreference: (id) => {
      const current = atoms.seedPreferences.get();
      const { [id]: _removed, ...seedPreferences } = current;
      writeAppCache("torrent", "seedPreferences", seedPreferences);
      atoms.seedPreferences.set(seedPreferences);
    },
  };

  finishAdopt(() => ({ ...mirror }), { remove: "cache" });

  return handle;
}

const cache = createCacheSignalStore();

export const cacheAtoms = cache.atoms;
export const setEpisodeTracker = cache.setEpisodeTracker;
export const syncTorrentOrder = cache.syncTorrentOrder;
export const moveTorrentOrder = cache.moveTorrentOrder;
export const moveTorrentOrderTo = cache.moveTorrentOrderTo;
export const setFolderTrees = cache.setFolderTrees;
export const setLastSaveDir = cache.setLastSaveDir;
export const setSeedPreference = cache.setSeedPreference;
export const removeSeedPreference = cache.removeSeedPreference;

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => cache.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cache.persistor.flush();
  });
}
