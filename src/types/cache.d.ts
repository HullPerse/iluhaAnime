import type { FranchiseGraph } from "./anilist";
import type { FolderNode } from "./torrent";

export interface FranchiseCacheEntry {
  graph: FranchiseGraph;
  fetchedAt: number;
}

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
  franchiseCache: Record<string, FranchiseCacheEntry>;
  folderTrees: { path: string; tree: FolderNode }[];
  lastSaveDir: string;
  seedPreferences: Record<number, boolean>;
  episodeTracker: Record<number, number>;
  initialScanDone: boolean;

  setFranchiseCache: (key: string, graph: FranchiseGraph) => void;
  clearFranchiseCache: (key: string) => void;
  setFolderTrees: (trees: { path: string; tree: FolderNode }[]) => void;
  setLastSaveDir: (dir: string) => void;
  setSeedPreference: (id: number, enabled: boolean) => void;
  setEpisodeTracker: (tracker: Record<number, number>) => void;
  setInitialScanDone: (v: boolean) => void;
}
