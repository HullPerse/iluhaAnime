import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { translate } from "@/lib/i18n";
import { showError } from "@/lib/notification.utils";
import { TorrentListen } from "@/lib/torrent.utils";
import { useCacheStore } from "@/store/cache.store";
import { useSettingsStore } from "@/store/settings.store";
import type { FilePriority } from "@/types";
import type {
  TorrentCheckResult,
  TorrentFileInfo,
  TorrentInfo,
  TorrentLimits,
  TorrentStore,
} from "@/types/torrent";

function tr(
  key: Parameters<typeof translate>[1],
  vars?: Parameters<typeof translate>[2]
) {
  return translate(useSettingsStore.getState().language, key, vars);
}

// Multiple visible torrent panels can ask for the same metadata during a
// refresh. Keep one backend request per torrent in flight at a time.
const fileLoadInFlight = new Set<number>();

export const useTorrentStore = create<TorrentStore>((set, get) => ({
  cancelDownload: async () => {
    const pending = get().pendingTorrent;
    if (!pending) {
      set({ preparingTorrent: false, pendingTorrent: null });
      return;
    }
    if (pending.id) {
      await invoke("remove_torrent", {
        id: pending.id,
        deleteFiles: false,
      }).catch((err) => showError(tr("download.errorCancel"), String(err)));
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

    const hasConflicts = selectedIndices.some((i) => {
      const file = pending.files.find((f) => f.index === i);
      return file && pending.conflictingFiles.includes(file.name);
    });

    if (hasConflicts) {
      const overwrite = await confirm(tr("download.confirmOverwrite"));
      if (!overwrite) return;
    }

    useCacheStore.getState().setLastSaveDir(saveDir);
    set({ lastSaveDir: saveDir });

    if (pending.id) {
      await invoke("remove_torrent", {
        id: pending.id,
        deleteFiles: false,
      }).catch((err) => showError(tr("download.errorClear"), String(err)));
    }

    const onlyFiles =
      selectedIndices.length === pending.files.length ? null : selectedIndices;

    const id = pending.magnet
      ? await invoke<number>("start_torrent_download", {
          magnet: pending.magnet,
          saveDir,
          onlyFiles,
          subFolder: subFolder || null,
        }).catch((err) => {
          showError(tr("download.errorStart"), String(err));
          return undefined;
        })
      : pending.fileBytes
        ? await invoke<number>("start_torrent_download_from_file", {
            fileBytes: pending.fileBytes,
            saveDir,
            onlyFiles,
            subFolder: subFolder || null,
          }).catch((err) => {
            showError(tr("download.errorStart"), String(err));
            return undefined;
          })
        : undefined;

    if (id === undefined) return;

    set({ pendingTorrent: null });

    if (sequential) {
      await invoke("set_sequential_download", { id, enabled: true }).catch(
        (err) => showError(tr("download.errorSequential"), String(err))
      );
    }
  },
  dlLimit: null,
  getTorrentLimits: async (id: number) => {
    return invoke<TorrentLimits>("get_torrent_limits", { id }).catch(() => ({
      downloadBps: null,
      uploadBps: null,
    }));
  },
  init: async () => {
    const initial = await invoke<TorrentInfo[]>("list_torrents");
    set({ torrents: initial ?? [] });

    const prefs = get().seedPreferences;
    for (const t of initial ?? []) {
      if (t.finished && !prefs[t.id] && t.state === "live") {
        invoke("pause_torrent", { id: t.id }).catch(() => {});
      }
    }

    const unlisten = await listen<TorrentInfo[]>("torrents-update", (event) => {
      set((state) => TorrentListen(state, event));
      const prefs = useTorrentStore.getState().seedPreferences;
      for (const t of event.payload) {
        if (t.finished && !prefs[t.id] && t.state === "live") {
          invoke("pause_torrent", { id: t.id }).catch(() => {});
        }
      }
    });

    return unlisten;
  },
  lastSaveDir: useCacheStore.getState().lastSaveDir,
  loadTorrentFiles: async (id: number) => {
    // A second caller can safely treat the existing request as in progress;
    // it should not turn request deduplication into a fake backend failure.
    if (fileLoadInFlight.has(id)) return true;
    fileLoadInFlight.add(id);
    try {
      const files = await invoke<TorrentFileInfo[]>(
        "get_running_torrent_files",
        {
          id,
        }
      ).catch(() => null);
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
  pauseTorrent: async (id: number) => {
    await invoke("pause_torrent", { id }).catch((err) =>
      showError(tr("download.errorPause"), String(err))
    );
  },
  pendingTorrent: null,
  prepareTorrentDownload: async (magnet: string) => {
    if (get().preparingTorrent) return;
    let saveDir = get().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: tr("download.selectFolder"),
      });
      if (!dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(saveDir);
      set({ lastSaveDir: saveDir });
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

    const result = await invoke<{
      id: number;
      name: string;
      files: TorrentFileInfo[];
      conflicting_files: string[];
      has_common_folder: boolean;
    }>("get_torrent_info", { magnet, saveDir }).catch((err) => {
      showError(tr("download.errorGetInfo"), String(err));
      return null;
    });

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
    let saveDir = get().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: tr("download.selectFolder"),
      });
      if (!dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(saveDir);
      set({ lastSaveDir: saveDir });
    }

    set({ preparingTorrent: true });

    const fileBytes = await invoke<number[]>("read_file_bytes", {
      path: filePath,
    }).catch((err) => {
      showError(tr("download.errorReadFile"), String(err));
      return null;
    });

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

    const result = await invoke<{
      id: number;
      name: string;
      files: TorrentFileInfo[];
      conflicting_files: string[];
      has_common_folder: boolean;
    }>("get_torrent_info_from_file", { fileBytes, saveDir }).catch((err) => {
      showError(tr("download.errorGetInfo"), String(err));
      return null;
    });

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
    let saveDir = get().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: tr("download.selectFolder"),
      });
      if (!dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(saveDir);
      set({ lastSaveDir: saveDir });
    }

    set({ preparingTorrent: true });

    const result = await invoke<{
      id: number;
      name: string;
      files: TorrentFileInfo[];
      conflicting_files: string[];
      has_common_folder: boolean;
    }>("get_torrent_info_from_file", { fileBytes, saveDir }).catch((err) => {
      showError(tr("download.errorGetInfo"), String(err));
      return null;
    });

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
  recheckTorrent: async (id: number) => {
    const result = await invoke<TorrentCheckResult>("recheck_torrent", {
      id,
    }).catch((err) => {
      showError(tr("download.errorRecheck"), String(err));
      return null;
    });
    if (result) {
      useTorrentStore.getState().loadTorrentFiles(id);
    }
    return result;
  },
  redownloadFile: async (id: number, fileIndex: number, infoHash: string) => {
    const newId = await invoke<number>("redownload_file", {
      id,
      fileIndex,
      infoHash,
    }).catch((err) => {
      showError(tr("download.errorRedownload"), String(err));
      return null;
    });
    if (newId === null) return;
    const state = useTorrentStore.getState();
    if (state.torrentFilesMap[newId]) {
      state.loadTorrentFiles(newId);
    } else if (state.torrentFilesMap[id]) {
      state.loadTorrentFiles(id);
    }
  },
  removeTorrent: async (id: number, deleteFiles: boolean) => {
    set((s) => {
      const { [id]: _, ...rest } = s.torrentFilesMap;
      const { [id]: __, ...seedRest } = s.seedPreferences;
      useCacheStore.setState({ seedPreferences: seedRest });
      return { torrentFilesMap: rest, seedPreferences: seedRest };
    });
    await invoke("remove_torrent", { id, deleteFiles }).catch((err) =>
      showError(tr("download.errorRemove"), String(err))
    );
  },
  resumeTorrent: async (id: number) => {
    await invoke("resume_torrent", { id }).catch((err) =>
      showError(tr("download.errorResume"), String(err))
    );
  },
  seedPreferences: useCacheStore.getState().seedPreferences,
  setFilePriority: async (
    id: number,
    fileIndices: number[],
    priority: FilePriority
  ) => {
    await invoke("set_file_priority", { id, fileIndices, priority }).catch(
      (err) => showError(tr("download.errorPriority"), String(err))
    );
    const state = useTorrentStore.getState();
    if (state.torrentFilesMap[id]) {
      state.loadTorrentFiles(id);
    }
  },
  setSeedPreference: (id: number, enabled: boolean) => {
    set((state) => {
      const prefs = { ...state.seedPreferences, [id]: enabled };
      useCacheStore.setState({ seedPreferences: prefs });
      return { seedPreferences: prefs };
    });
  },
  setSequentialDownload: async (id: number, enabled: boolean) => {
    await invoke("set_sequential_download", { id, enabled }).catch((err) =>
      showError(tr("download.errorSequential"), String(err))
    );
    set((state) => ({
      torrents: state.torrents.map((t) =>
        t.id === id ? { ...t, sequential_download: enabled } : t
      ),
    }));
  },
  setSpeedLimits: async (dlKbps: number | null, ulKbps: number | null) => {
    set({ dlLimit: dlKbps, ulLimit: ulKbps });
    const dlBps = dlKbps !== null ? dlKbps * 1024 : null;
    const ulBps = ulKbps !== null ? ulKbps * 1024 : null;
    await invoke("set_global_speed_limits", {
      downloadBps: dlBps,
      uploadBps: ulBps,
    }).catch((err) => showError(tr("download.errorLimit"), String(err)));
  },
  setTorrentLimits: async (
    id: number,
    dlKbps: number | null,
    ulKbps: number | null
  ) => {
    const downloadBps =
      dlKbps !== null && dlKbps > 0 ? Math.round(dlKbps * 1024) : null;
    const uploadBps =
      ulKbps !== null && ulKbps > 0 ? Math.round(ulKbps * 1024) : null;
    await invoke("set_torrent_limits", {
      id,
      limits: { downloadBps, uploadBps },
    }).catch((err) => showError(tr("download.errorSetLimits"), String(err)));
  },
  torrentFilesMap: {},
  torrents: [],
  ulLimit: null,
  updateTorrentOnlyFiles: async (id: number, indices: number[]) => {
    await invoke("update_torrent_only_files", { id, onlyFiles: indices }).catch(
      (err) => showError(tr("download.errorUpdate"), String(err))
    );
  },
}));
