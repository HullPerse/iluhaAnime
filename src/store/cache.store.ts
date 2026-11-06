import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { buildMirrorAtoms, createPersistedStoreContext } from "@/lib/core/persistence/persisted.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import { moveItem } from "@hullperse/hp_utils/array";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import type { CacheStore } from "@/types/core/cache";
import type { FolderNode } from "@/types/torrent/torrent";

export const CACHE_SCHEMA_VERSION = SCHEMA_VERSIONS.cache;

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

function readNumberRecord(value: unknown): Record<number, number> {
  if (!isRecord(value)) return {};
  const result: Record<number, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    const id = Number(key);
    if (Number.isInteger(id) && typeof entry === "number" && Number.isFinite(entry)) {
      result[id] = entry;
    }
  }
  return result;
}

function readBooleanRecord(value: unknown): Record<number, boolean> {
  if (!isRecord(value)) return {};
  const result: Record<number, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    const id = Number(key);
    if (Number.isInteger(id) && typeof entry === "boolean") result[id] = entry;
  }
  return result;
}

function readFolderNode(value: unknown): FolderNode | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string" || typeof value.path !== "string") return null;
  if (!Array.isArray(value.files) || !Array.isArray(value.children)) return null;
  const files = value.files.flatMap((file) => {
    if (!isRecord(file)) return [];
    if (typeof file.path !== "string" || typeof file.name !== "string") return [];
    if (typeof file.size !== "number" || !Number.isFinite(file.size)) return [];
    return [{ path: file.path, name: file.name, size: file.size }];
  });
  const children = value.children.flatMap((child) => {
    const node = readFolderNode(child);
    return node ? [node] : [];
  });
  return { name: value.name, path: value.path, files, children };
}

function readFolderTrees(value: unknown): CacheData["folderTrees"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string") return [];
    const tree = readFolderNode(entry.tree);
    return tree ? [{ path: entry.path, tree }] : [];
  });
}

function readCacheData(raw: unknown): CacheData {
  if (!isRecord(raw)) return { ...DEFAULT_CACHE_DATA };
  return {
    episodeTracker: readNumberRecord(raw.episodeTracker),
    folderTrees: readFolderTrees(raw.folderTrees),
    lastSaveDir: typeof raw.lastSaveDir === "string" ? raw.lastSaveDir : "",
    seedPreferences: readBooleanRecord(raw.seedPreferences),
    torrentOrder: Array.isArray(raw.torrentOrder)
      ? raw.torrentOrder.filter((id): id is number => typeof id === "number")
      : [],
  };
}

function readLegacyCache(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("cache"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  return { data: state, schemaVersion: CACHE_SCHEMA_VERSION };
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

export function createCacheSignalStore(options: CacheSignalOptions = {}): CacheSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "cache",
    short: "cache",
    schemaVersion: CACHE_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyCache(get),
  });

  const persisted = persistor.read();
  const data: CacheData = readCacheData(persisted?.data);
  const mirror: Record<string, unknown> = { ...data };
  const atoms = buildMirrorAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const handle: CacheSignalStore = {
    atoms,
    persistor,
    setEpisodeTracker: (tracker) => {
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
      atoms.torrentOrder.set(next);
    },
    moveTorrentOrder: (id, neighborId) => {
      const torrentOrder = atoms.torrentOrder.get();
      const from = torrentOrder.indexOf(id);
      const to = torrentOrder.indexOf(neighborId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...torrentOrder];
      [next[from], next[to]] = [next[to], next[from]];
      atoms.torrentOrder.set(next);
    },
    moveTorrentOrderTo: (id, targetId) => {
      const torrentOrder = atoms.torrentOrder.get();
      const from = torrentOrder.indexOf(id);
      const to = torrentOrder.indexOf(targetId);
      if (from === -1 || to === -1) return;
      const next = moveItem(torrentOrder, from, to);
      if (next === torrentOrder) return;
      atoms.torrentOrder.set(next);
    },
    setFolderTrees: (trees) => {
      atoms.folderTrees.set(trees);
    },
    setLastSaveDir: (dir) => {
      atoms.lastSaveDir.set(dir);
    },
    setSeedPreference: (id, enabled) => {
      atoms.seedPreferences.set({ ...atoms.seedPreferences.get(), [id]: enabled });
    },
    removeSeedPreference: (id) => {
      const current = atoms.seedPreferences.get();
      const { [id]: _removed, ...seedPreferences } = current;
      atoms.seedPreferences.set(seedPreferences);
    },
  };

  finishAdopt(() => ({ ...mirror }), { remove: "cache" });

  return handle;
}

const cache = createCacheSignalStore();

export const cacheAtoms = cache.atoms;
export const syncTorrentOrder = cache.syncTorrentOrder;
export const moveTorrentOrder = cache.moveTorrentOrder;
export const moveTorrentOrderTo = cache.moveTorrentOrderTo;
export const setFolderTrees = cache.setFolderTrees;
export const setLastSaveDir = cache.setLastSaveDir;
export const setSeedPreference = cache.setSeedPreference;
export const removeSeedPreference = cache.removeSeedPreference;

