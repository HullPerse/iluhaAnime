import { listen } from "@tauri-apps/api/event";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { translate } from "@/lib/locale/i18n.utils";
import { TorrentListen, findJustFinished, findNewErrors, torrentErrorText } from "@/lib/torrent/common.utils";
import { attempt, withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useCacheStore } from "@/store/cache.store";
import { useSettingsStore } from "@/store/settings.store";
import type { FilePriority } from "@/types";
import type {
  SpeedLimits,
  TorrentCheckResult,
  TorrentFileInfo,
  TorrentInfo,
  TorrentLimits,
  TorrentStore,
} from "@/types/torrent";

function tr(key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) {
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

const fileLoadInFlight = new Set<number>();

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
  init: async () => {
    const initial = await invokeTyped<TorrentInfo[]>("list_torrents");
    set({ torrents: initial ?? [] });

    const prefs = useCacheStore.getState().seedPreferences;
    for (const t of findJustFinished([], initial ?? [], prefs)) {
      invokeTyped("pause_torrent", { id: t.id }).catch(() => {});
    }

    const unlisten = await listen<TorrentInfo[]>("torrents-update", (event) => {
      const prev = get().torrents;
      set((state) => TorrentListen(state, event));
      for (const t of findNewErrors(prev, event.payload)) {
        showError(tr("torrent.state.error"), `${t.name}: ${t.error}`);
      }
      const prefs = useCacheStore.getState().seedPreferences;
      for (const t of findJustFinished(prev, event.payload, prefs)) {
        invokeTyped("pause_torrent", { id: t.id }).catch(() => {});
      }
    });

    return unlisten;
  },
  refreshTorrents: async () => {
    const [list] = await attempt(invokeTyped<TorrentInfo[]>("list_torrents"));
    if (!list) return;
    set((state) => {
      const ids = new Set(list.map((t) => t.id));
      const lastActiveAt = Object.fromEntries(
        Object.entries(state.lastActiveAt).filter(([key]) => ids.has(Number(key)))
      );
      return { torrents: list, lastActiveAt };
    });
  },
  loadTorrentFiles: async (id: number) => {
    if (!id) return false;
    if (fileLoadInFlight.has(id)) return true;
    fileLoadInFlight.add(id);
    try {
      const files = await withFallback(
        invokeTyped<TorrentFileInfo[]>("get_running_torrent_files", { id }),
        null
      );
      if (files) {
        set((state) => {
          const prev = state.torrentFilesMap[id];
          if (
            prev &&
            prev.length === files.length &&
            prev.every((f, i) => {
              const n = files[i];
              return (
                f.index === n.index &&
                f.completed === n.completed &&
                f.selected === n.selected &&
                f.exists === n.exists &&
                f.progress_bytes === n.progress_bytes &&
                f.priority === n.priority
              );
            })
          ) {
            return state;
          }
          return { torrentFilesMap: { ...state.torrentFilesMap, [id]: files } };
        });
        return true;
      }
      return false;
    } finally {
      fileLoadInFlight.delete(id);
    }
  },
  metadataCache: new Map(),
  pauseTorrent: async (id: number, infoHash?: string) => {
    if (!id || get().opInFlight[id] !== undefined) return;
    const prev = get().torrents.find((t) => t.id === id);
    set((state) => ({
      opInFlight: { ...state.opInFlight, [id]: "pause" as const },
      torrents: state.torrents.map((t) => (t.id === id ? { ...t, state: "paused" } : t)),
    }));
    const [, error] = await attempt(invokeTyped("pause_torrent", { id, infoHash }));
    if (error) {
      showError(tr("download.error.pause"), torrentErrorText(error.message, tr));
      if (prev !== undefined) {
        set((state) => ({ torrents: state.torrents.map((t) => (t.id === id ? prev : t)) }));
      }
    } else {
      await get().refreshTorrents();
    }
    set((state) => {
      const next = { ...state.opInFlight };
      delete next[id];
      return { opInFlight: next };
    });
  },
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
  recheckTorrent: async (id: number, infoHash?: string) => {
    if (!id) return null;
    const [result, error] = await attempt(
      invokeTyped<TorrentCheckResult>("recheck_torrent", { id, infoHash })
    );
    if (error) showError(tr("download.error.recheck"), torrentErrorText(error.message, tr));
    if (result) {
      useTorrentStore.getState().loadTorrentFiles(id);
    }
    return result;
  },
  redownloadFile: async (id: number, fileIndex: number, infoHash: string) => {
    if (!id) return;
    const [newId, error] = await attempt(
      invokeTyped<number>("redownload_file", { id, fileIndex, infoHash })
    );
    if (error) showError(tr("download.error.redownload"), torrentErrorText(error.message, tr));
    if (newId === null) return;
    await useTorrentStore.getState().loadTorrentFiles(newId);
  },
  removeTorrent: async (id: number, deleteFiles: boolean, infoHash?: string) => {
    if (!id || get().opInFlight[id] !== undefined) return false;
    set((state) => ({ opInFlight: { ...state.opInFlight, [id]: "remove" as const } }));
    const [, error] = await attempt(
      invokeTyped("remove_torrent", { id, deleteFiles, infoHash })
    );
    set((state) => {
      const next = { ...state.opInFlight };
      delete next[id];
      return { opInFlight: next };
    });
    if (error) {
      showError(tr("download.error.remove"), torrentErrorText(error.message, tr));
      return false;
    }
    useCacheStore.getState().removeSeedPreference(id);
    set((state) => {
      const torrentFilesMap = { ...state.torrentFilesMap };
      delete torrentFilesMap[id];
      const lastActiveAt = { ...state.lastActiveAt };
      delete lastActiveAt[id];
      return {
        torrents: state.torrents.filter((t) => t.id !== id),
        torrentFilesMap,
        lastActiveAt,
      };
    });
    return true;
  },
  resumeTorrent: async (id: number, infoHash?: string) => {
    if (!id || get().opInFlight[id] !== undefined) return;
    const prev = get().torrents.find((t) => t.id === id);
    set((state) => ({
      opInFlight: { ...state.opInFlight, [id]: "resume" as const },
      torrents: state.torrents.map((t) => (t.id === id ? { ...t, state: "live" } : t)),
    }));
    const [, error] = await attempt(invokeTyped("resume_torrent", { id, infoHash }));
    if (error) {
      showError(tr("download.error.resume"), torrentErrorText(error.message, tr));
      if (prev !== undefined) {
        set((state) => ({ torrents: state.torrents.map((t) => (t.id === id ? prev : t)) }));
      }
    } else {
      await get().refreshTorrents();
    }
    set((state) => {
      const next = { ...state.opInFlight };
      delete next[id];
      return { opInFlight: next };
    });
  },
  setFilePriority: async (
    id: number,
    fileIndices: number[],
    priority: FilePriority,
    infoHash?: string
  ) => {
    if (!id) return;
    const [, error] = await attempt(
      invokeTyped("set_file_priority", { id, fileIndices, priority, infoHash })
    );
    if (error) showError(tr("download.error.priority"), torrentErrorText(error.message, tr));
    const state = useTorrentStore.getState();
    if (state.torrentFilesMap[id]) {
      state.loadTorrentFiles(id);
    }
  },
  setSequentialDownload: async (id: number, enabled: boolean, infoHash?: string) => {
    if (!id) return;
    const [, error] = await attempt(
      invokeTyped("set_sequential_download", { id, enabled, infoHash })
    );
    if (error) {
      showError(tr("download.error.sequential"), torrentErrorText(error.message, tr));
      return;
    }
    set((state) => ({
      torrents: state.torrents.map((t) =>
        t.id === id ? { ...t, sequential_download: enabled } : t
      ),
    }));
  },
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
    if (!id) return;
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
  torrentFilesMap: {},
  torrents: [],
  lastActiveAt: {},
  updateTorrentOnlyFiles: async (id: number, indices: number[], infoHash?: string) => {
    if (!id) return;
    const [, error] = await attempt(
      invokeTyped("update_torrent_only_files", { id, onlyFiles: indices, infoHash })
    );
    if (error) showError(tr("download.error.update"), torrentErrorText(error.message, tr));
  },
}));
