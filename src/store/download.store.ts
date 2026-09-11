import { open, confirm } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { translate } from "@/lib/locale/i18n.utils";
import { torrentErrorText } from "@/lib/torrent/common.utils";
import { attempt, withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useCacheStore } from "@/store/cache.store";
import { useSettingsStore } from "@/store/settings.store";
import type { SpeedLimits, TorrentFileInfo, TorrentLimits, TorrentStore } from "@/types/torrent";

export function tr(key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) {
  return translate(useSettingsStore.getState().language, key, vars);
}

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
  subFolder: string | undefined
): Promise<number | undefined> {
  if (pending.magnet) {
    const [id, error] = await attempt(
      invokeTyped<number>("start_torrent_download", {
        magnet: pending.magnet,
        saveDir,
        onlyFiles,
        subFolder: subFolder || null,
      })
    );
    if (error) {
      showError(tr("download.error.start"), error.message);
      return undefined;
    }
    return id;
  }
  if (pending.fileBytes) {
    const [id, error] = await attempt(
      invokeTyped<number>("start_torrent_download_from_file", {
        fileBytes: pending.fileBytes,
        saveDir,
        onlyFiles,
        subFolder: subFolder || null,
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
  const [, error] = await attempt(invokeTyped("remove_torrent", { id, deleteFiles: false }));
  if (error) showError(tr("download.error.clear"), error.message);
}

export const useTorrentStore = create<TorrentStore>((set, get) => ({
  cancelDownload: async () => {
    const pending = get().pendingTorrent;
    if (!pending) {
      set({ preparingTorrent: false, pendingTorrent: null });
      return;
    }
    if (pending.id) {
      const [, error] = await attempt(
        invokeTyped("remove_torrent", { id: pending.id, deleteFiles: false })
      );
      if (error) showError(tr("download.error.cancel"), error.message);
    }
    set({ preparingTorrent: false, pendingTorrent: null });
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
    const id = await startDownloadForPending(pending, saveDir, onlyFiles, subFolder);
    if (id === undefined) return;
    set({ pendingTorrent: null });
    if (!sequential) return;
    const [, error] = await attempt(invokeTyped("set_sequential_download", { id, enabled: true }));
    if (error) showError(tr("download.error.sequential"), error.message);
  },
  limits: { download: null, upload: null },
  getTorrentLimits: async (id: number) => {
    return withFallback(invokeTyped<TorrentLimits>("get_torrent_limits", { id }), {
      downloadBps: null,
      uploadBps: null,
    });
  },
  metadataCache: new Map(),
  pendingTorrent: null,
  prepareTorrentDownload: async (magnet: string) => {
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
        },
      });
      return;
    }

    const [result, error] = await attempt(
      invokeTyped<{
        id: number;
        name: string;
        files: TorrentFileInfo[];
        conflicting_files: string[];
        has_common_folder: boolean;
      }>("get_torrent_info", { magnet, saveDir })
    );
    if (error) showError(tr("download.error.get.info"), error.message);

    if (!result) {
      set({ preparingTorrent: false });
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
        },
        metadataCache: cache,
      };
    });
  },
  prepareTorrentDownloadFromFile: async (filePath: string) => {
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

    const [fileBytes, error] = await attempt(
      invokeTyped<number[]>("read_file_bytes", { path: filePath })
    );
    if (error) showError(tr("download.error.read.file"), error.message);

    if (!fileBytes) {
      set({ preparingTorrent: false });
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
        },
      });
      return;
    }

    const [result, infoError] = await attempt(
      invokeTyped<{
        id: number;
        name: string;
        files: TorrentFileInfo[];
        conflicting_files: string[];
        has_common_folder: boolean;
      }>("get_torrent_info_from_file", { fileBytes, saveDir })
    );
    if (infoError) showError(tr("download.error.get.info"), infoError.message);

    if (!result) {
      set({ preparingTorrent: false });
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
        },
        metadataCache: cache,
      };
    });
  },
  prepareTorrentDownloadFromBytes: async (fileBytes: number[]) => {
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

    const [result, error] = await attempt(
      invokeTyped<{
        id: number;
        name: string;
        files: TorrentFileInfo[];
        conflicting_files: string[];
        has_common_folder: boolean;
      }>("get_torrent_info_from_file", { fileBytes, saveDir })
    );
    if (error) showError(tr("download.error.get.info"), error.message);

    if (!result) {
      set({ preparingTorrent: false });
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
      },
    });
  },
  preparingTorrent: false,
  setSpeedLimits: async (limits: SpeedLimits) => {
    set({ limits });
    const downloadBps = limits.download !== null ? limits.download * 1024 : null;
    const uploadBps = limits.upload !== null ? limits.upload * 1024 : null;
    const [, error] = await attempt(
      invokeTyped("set_global_speed_limits", { downloadBps, uploadBps })
    );
    if (error) showError(tr("download.error.limit"), error.message);
  },
  setTorrentLimits: async (id: number, limits: SpeedLimits, infoHash?: string) => {
    if (!Number.isInteger(id)) return;
    const downloadBps =
      limits.download !== null && limits.download > 0 ? Math.round(limits.download * 1024) : null;
    const uploadBps =
      limits.upload !== null && limits.upload > 0 ? Math.round(limits.upload * 1024) : null;
    const [, error] = await attempt(
      invokeTyped("set_torrent_limits", { id, limits: { downloadBps, uploadBps }, infoHash })
    );
    if (error) showError(tr("download.error.set.limits"), torrentErrorText(error.message, tr));
  },
  opInFlight: {},
  lastActiveAt: {},
}));
