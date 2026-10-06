import { open, confirm } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { systemApi } from "@/api/system.api";
import { torrentApi } from "@/api/torrent.api";
import { tr } from "@/lib/locale/i18n.utils";
import { torrentErrorText } from "@/lib/torrent/common.utils";
import { attempt, withFallback } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { useCacheStore } from "@/store/cache.store";
import type { SpeedLimits, TorrentStore } from "@/types/torrent";

export { tr };

function hasConflictingSelection(
  pending: { files: { index: number; name: string }[]; conflictingFiles: string[] },
  selectedIndices: number[]
): boolean {
  return selectedIndices.some((i) => {
    const file = pending.files.find((f) => f.index === i);
    return Boolean(file && pending.conflictingFiles.includes(file.name));
  });
}

function resolveOnlyFiles(allFiles: { index: number }[], selected: number[]): number[] | null {
  return selected.length === allFiles.length ? null : selected;
}

async function startDownloadForPending(
  pending: { magnet?: string; fileBytes?: number[] },
  saveDir: string,
  onlyFiles: number[] | null,
  subFolder: string | undefined,
  sequential: boolean
): Promise<number | undefined> {
  if (pending.magnet || pending.fileBytes) {
    const [id, error] = await attempt(
      torrentApi.startTorrentDownload({
        magnet: pending.magnet,
        fileBytes: pending.fileBytes,
        saveDir,
        onlyFiles,
        subFolder: subFolder || null,
        sequential,
      })
    );
    if (error) {
      showError(tr("download.error.start"), error.message);
      return undefined;
    }
    return id;
  }
  return undefined;
}

async function clearPreviousTorrentIfNeeded(id: number | undefined): Promise<void> {
  if (!id) return;
  const [, error] = await attempt(torrentApi.removeTorrent(id, false));
  if (error) showError(tr("download.error.clear"), error.message);
}

export const useTorrentStore = create<TorrentStore>((set, get) => ({
  cancelDownload: async () => {
    const pending = get().pendingTorrent;
    if (!pending) {
      set({ preparingTorrent: false, pendingTorrent: null });
      get().prepareNextInQueue();
      return;
    }
    if (pending.id) {
      const [, error] = await attempt(torrentApi.removeTorrent(pending.id, false));
      if (error) showError(tr("download.error.cancel"), error.message);
    }
    set({ preparingTorrent: false, pendingTorrent: null });
    get().prepareNextInQueue();
  },
  confirmDownload: async (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean
  ) => {
    const pending = get().pendingTorrent;
    if (!pending) return;
    if (hasConflictingSelection(pending, selectedIndices)) {
      const overwrite = await confirm(tr("download.confirm.overwrite"));
      if (!overwrite) return;
    }
    useCacheStore.getState().setLastSaveDir(saveDir);
    await clearPreviousTorrentIfNeeded(pending.id);
    const onlyFiles = resolveOnlyFiles(pending.files, selectedIndices);

    const id = await startDownloadForPending(
      pending,
      saveDir,
      onlyFiles,
      subFolder,
      sequential ?? false
    );
    if (id === undefined) return;
    set({ pendingTorrent: null });
    get().prepareNextInQueue();
  },
  limits: { download: null, upload: null },
  getTorrentLimits: async (id: number) => {
    return withFallback(torrentApi.getTorrentLimits(id), {
      downloadBps: null,
      uploadBps: null,
    });
  },
  metadataCache: new Map(),
  pendingTorrent: null,
  prepareQueue: [],
  queueTorrentFiles: (filePaths: string[]) => {
    if (filePaths.length === 0) return;
    set((state) => ({
      prepareQueue: [
        ...state.prepareQueue,
        ...filePaths.map((value) => ({ kind: "file" as const, value })),
      ],
    }));
    get().prepareNextInQueue();
  },
  prepareNextInQueue: () => {
    const state = get();
    if (state.preparingTorrent || state.pendingTorrent) return;
    const next = state.prepareQueue[0];
    if (!next) return;
    set((prev) => ({ prepareQueue: prev.prepareQueue.slice(1) }));
    if (next.kind === "magnet") ignore(state.prepareTorrentDownload(next.value));
    else ignore(state.prepareTorrentDownloadFromFile(next.value));
  },
  prepareTorrentDownload: async (magnet: string, info?: { seeders?: number }) => {
    if (get().preparingTorrent) return;
    let saveDir = useCacheStore.getState().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: tr("download.select.folder"),
      });
      if (!dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(saveDir);
    }

    set({ preparingTorrent: true });

    const cached = get().metadataCache.get(magnet);
    if (cached) {
      set({
        preparingTorrent: false,
        pendingTorrent: {
          magnet,
          id: 0,
          name: cached.name,
          files: cached.files,
          conflictingFiles: cached.conflictingFiles,
          hasCommonFolder: cached.hasCommonFolder,
          seeders: info?.seeders,
        },
      });
      return;
    }

    const [result, error] = await attempt(torrentApi.getTorrentInfo(magnet, saveDir));
    if (error) showError(tr("download.error.get.info"), error.message);

    if (!result) {
      set({ preparingTorrent: false });
      get().prepareNextInQueue();
      return;
    }

    set((state) => {
      const cache = new Map(state.metadataCache);
      cache.set(magnet, {
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        savedAt: Date.now(),
      });
      return {
        preparingTorrent: false,
        pendingTorrent: {
          magnet,
          id: result.id,
          name: result.name,
          files: result.files,
          conflictingFiles: result.conflicting_files,
          hasCommonFolder: result.has_common_folder,
          seeders: info?.seeders,
        },
        metadataCache: cache,
      };
    });
  },
  prepareTorrentDownloadFromFile: async (filePath: string, info?: { seeders?: number }) => {
    if (get().preparingTorrent) return;
    let saveDir = useCacheStore.getState().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: tr("download.select.folder"),
      });
      if (!dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(saveDir);
    }

    set({ preparingTorrent: true });

    const [fileBytes, error] = await attempt(systemApi.readFileBytes(filePath));
    if (error) showError(tr("download.error.read.file"), error.message);

    if (!fileBytes) {
      set({ preparingTorrent: false });
      get().prepareNextInQueue();
      return;
    }

    const cached = get().metadataCache.get(filePath);
    if (cached) {
      set({
        preparingTorrent: false,
        pendingTorrent: {
          fileBytes,
          id: 0,
          name: cached.name,
          files: cached.files,
          conflictingFiles: cached.conflictingFiles,
          hasCommonFolder: cached.hasCommonFolder,
          seeders: info?.seeders,
        },
      });
      return;
    }

    const [result, infoError] = await attempt(
      torrentApi.getTorrentInfoFromFile(fileBytes, saveDir)
    );
    if (infoError) showError(tr("download.error.get.info"), infoError.message);

    if (!result) {
      set({ preparingTorrent: false });
      get().prepareNextInQueue();
      return;
    }

    set((state) => {
      const cache = new Map(state.metadataCache);
      cache.set(filePath, {
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        savedAt: Date.now(),
      });
      return {
        preparingTorrent: false,
        pendingTorrent: {
          fileBytes,
          id: result.id,
          name: result.name,
          files: result.files,
          conflictingFiles: result.conflicting_files,
          hasCommonFolder: result.has_common_folder,
          seeders: info?.seeders,
        },
        metadataCache: cache,
      };
    });
  },
  prepareTorrentDownloadFromBytes: async (fileBytes: number[], info?: { seeders?: number }) => {
    if (get().preparingTorrent) return;
    let saveDir = useCacheStore.getState().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: tr("download.select.folder"),
      });
      if (!dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(saveDir);
    }

    set({ preparingTorrent: true });

    const [result, error] = await attempt(torrentApi.getTorrentInfoFromFile(fileBytes, saveDir));
    if (error) showError(tr("download.error.get.info"), error.message);

    if (!result) {
      set({ preparingTorrent: false });
      get().prepareNextInQueue();
      return;
    }

    set({
      preparingTorrent: false,
      pendingTorrent: {
        fileBytes,
        id: result.id,
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        seeders: info?.seeders,
      },
    });
  },
  preparingTorrent: false,
  setSpeedLimits: async (limits: SpeedLimits) => {
    set({ limits });
    const downloadBps = limits.download !== null ? limits.download * 1024 : null;
    const uploadBps = limits.upload !== null ? limits.upload * 1024 : null;
    const [, error] = await attempt(torrentApi.setGlobalSpeedLimits(downloadBps, uploadBps));
    if (error) showError(tr("download.error.limit"), error.message);
  },
  setTorrentLimits: async (id: number, limits: SpeedLimits, infoHash?: string) => {
    if (!Number.isInteger(id)) return;
    const downloadBps =
      limits.download !== null && limits.download > 0 ? Math.round(limits.download * 1024) : null;
    const uploadBps =
      limits.upload !== null && limits.upload > 0 ? Math.round(limits.upload * 1024) : null;
    const [, error] = await attempt(
      torrentApi.setTorrentLimits(id, { downloadBps, uploadBps }, infoHash)
    );
    if (error) showError(tr("download.error.set.limits"), torrentErrorText(error.message, tr));
  },
  opInFlight: {},
  lastActiveAt: {},
}));
