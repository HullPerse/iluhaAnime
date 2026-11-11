import type { FolderNode } from "@/types/torrent/torrent";

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
  torrentOrder: number[];

  setFolderTrees: (trees: { path: string; tree: FolderNode }[]) => void;
  setLastSaveDir: (dir: string) => void;
  setSeedPreference: (id: number, enabled: boolean) => void;
  removeSeedPreference: (id: number) => void;
  setEpisodeTracker: (tracker: Record<number, number>) => void;
  syncTorrentOrder: (ids: number[]) => void;
  moveTorrentOrder: (id: number, neighborId: number) => void;
  moveTorrentOrderTo: (id: number, targetId: number) => void;
}
