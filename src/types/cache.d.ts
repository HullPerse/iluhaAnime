import type { FolderNode } from "./torrent";

export interface AppCacheRecord<T = unknown> {
  namespace: string;
  key: string;
  payload: T;
  expiresAt: number | null;
  updatedAt: number;
}

export interface RawAppCacheRecord {
  namespace: string;
  key: string;
  payload: string;
  expiresAt: number | null;
  updatedAt: number;
}

export interface CacheStore {
  folderTrees: { path: string; tree: FolderNode }[];
  lastSaveDir: string;
  seedPreferences: Record<number, boolean>;
  episodeTracker: Record<number, number>;
  initialScanDone: boolean;

  setFolderTrees: (trees: { path: string; tree: FolderNode }[]) => void;
  setLastSaveDir: (dir: string) => void;
  setSeedPreference: (id: number, enabled: boolean) => void;
  setEpisodeTracker: (tracker: Record<number, number>) => void;
  setInitialScanDone: (v: boolean) => void;
}

export interface LruCacheStats {
  capacity: number;
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface LruCache<K, V> {
  get: (key: K) => V | undefined;
  peek: (key: K) => V | undefined;
  set: (key: K, value: V) => void;
  has: (key: K) => boolean;
  delete: (key: K) => boolean;
  clear: () => void;
  stats: () => LruCacheStats;
}
