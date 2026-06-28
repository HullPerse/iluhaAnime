import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, confirm } from "@tauri-apps/plugin-dialog";

import type { FilePriority } from "@/types";
import { TorrentFileInfo, TorrentInfo, TorrentStore } from "@/types/torrent";
import { showError } from "@/lib/notification.utils";
import { TorrentListen } from "@/lib/torrent.utils";

function loadLastSaveDir(): string {
  try {
    return localStorage.getItem("lastSaveDir") || "";
  } catch {
    return "";
  }
}

function saveLastSaveDir(dir: string) {
  try {
    localStorage.setItem("lastSaveDir", dir);
  } catch {}
}

export const useTorrentStore = create<TorrentStore>((set, get) => ({
  torrents: [],
  dlLimit: null,
  ulLimit: null,
  lastSaveDir: loadLastSaveDir(),
  pendingTorrent: null,
  preparingTorrent: false,
  torrentFilesMap: {},

  init: async () => {
    const initial = await invoke<TorrentInfo[]>("list_torrents");
    set({ torrents: initial ?? [] });

    const unlisten = await listen<TorrentInfo[]>("torrents-update", (event) => {
      set((state) => TorrentListen(state, event));
    });

    return unlisten;
  },

  prepareTorrentDownload: async (magnet: string) => {
    if (get().preparingTorrent) return;
    let saveDir = get().lastSaveDir;
    if (!saveDir) {
      const dir = await open({
        directory: true,
        title: "Выберите папку для сохранения",
      });
      if (!dir) return;
      saveDir = dir;
      saveLastSaveDir(saveDir);
      set({ lastSaveDir: saveDir });
    }

    set({ preparingTorrent: true });

    const result = await invoke<{
      id: number;
      name: string;
      files: TorrentFileInfo[];
      conflicting_files: string[];
      has_common_folder: boolean;
    }>("get_torrent_info", { magnet, saveDir }).catch((err) => {
      showError("Ошибка при получении информации о торренте:", String(err));
      return null;
    });

    if (!result) {
      set({ preparingTorrent: false });
      return;
    }

    set({
      preparingTorrent: false,
      pendingTorrent: {
        magnet,
        id: result.id,
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
      },
    });
  },

  confirmDownload: async (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean,
  ) => {
    const pending = get().pendingTorrent;
    if (!pending) return;

    const hasConflicts = selectedIndices.some((i) => {
      const file = pending.files.find((f) => f.index === i);
      return file && pending.conflictingFiles.includes(file.name);
    });

    if (hasConflicts) {
      const overwrite = await confirm(
        "В папке назначения уже есть некоторые файлы. Перезаписать их?",
      );
      if (!overwrite) return;
    }

    saveLastSaveDir(saveDir);
    set({ lastSaveDir: saveDir });

    if (pending.id) {
      await invoke("remove_torrent", {
        id: pending.id,
        deleteFiles: false,
      }).catch((err) => showError("Ошибка при очистке торрента:", String(err)));
    }
    const id = await invoke<number>("start_torrent_download", {
      magnet: pending.magnet,
      saveDir,
      onlyFiles:
        selectedIndices.length === pending.files.length
          ? null
          : selectedIndices,
      subFolder: subFolder || null,
    }).catch((err) => {
      showError("Ошибка при старте торрента:", String(err));
      return undefined;
    });

    set({ pendingTorrent: null });

    if (id !== undefined && sequential) {
      await invoke("set_sequential_download", { id, enabled: true }).catch(
        (err) =>
          showError(
            "Ошибка при включении последовательного режима:",
            String(err),
          ),
      );
    }
  },

  cancelDownload: async () => {
    const pending = get().pendingTorrent;
    set({ preparingTorrent: false, pendingTorrent: null });
    if (!pending) return;
    if (pending.id) {
      await invoke("remove_torrent", {
        id: pending.id,
        deleteFiles: false,
      }).catch((err) => showError("Ошибка при отмене торрента:", String(err)));
    }
  },

  pauseTorrent: async (id: number) => {
    await invoke("pause_torrent", { id }).catch((err) =>
      showError("Ошибка при паузе торрента:", String(err)),
    );
  },

  resumeTorrent: async (id: number) => {
    await invoke("resume_torrent", { id }).catch((err) =>
      showError("Ошибка при продолжении торрента:", String(err)),
    );
  },

  removeTorrent: async (id: number, deleteFiles: boolean) => {
    set((s) => {
      const { [id]: _, ...rest } = s.torrentFilesMap;
      return { torrentFilesMap: rest };
    });
    await invoke("remove_torrent", { id, deleteFiles }).catch((err) =>
      showError("Ошибка при удалении торрента:", String(err)),
    );
  },

  setSpeedLimits: async (dlKbps: number | null, ulKbps: number | null) => {
    set({ dlLimit: dlKbps, ulLimit: ulKbps });
    const dlBps = dlKbps !== null ? dlKbps * 1024 : null;
    const ulBps = ulKbps !== null ? ulKbps * 1024 : null;
    await invoke("set_global_speed_limits", {
      downloadBps: dlBps,
      uploadBps: ulBps,
    }).catch((err) => showError("Ошибка при изменении лимита:", String(err)));
  },

  loadTorrentFiles: async (id: number) => {
    const files = await invoke<TorrentFileInfo[]>("get_running_torrent_files", {
      id,
    }).catch(() => null);
    if (files) {
      set((state) => ({
        torrentFilesMap: { ...state.torrentFilesMap, [id]: files },
      }));
    }
  },

  updateTorrentOnlyFiles: async (id: number, indices: number[]) => {
    await invoke("update_torrent_only_files", { id, onlyFiles: indices }).catch(
      (err) => showError("Ошибка при обновлении торрента:", String(err)),
    );
  },

  setFilePriority: async (
    id: number,
    fileIndices: number[],
    priority: FilePriority,
  ) => {
    await invoke("set_file_priority", { id, fileIndices, priority }).catch(
      (err) => showError("Ошибка при установке приоритета:", String(err)),
    );
    // Refresh files to reflect the change
    const state = useTorrentStore.getState();
    if (state.torrentFilesMap[id]) {
      state.loadTorrentFiles(id);
    }
  },

  setSequentialDownload: async (id: number, enabled: boolean) => {
    await invoke("set_sequential_download", { id, enabled }).catch((err) =>
      showError("Ошибка при включении последовательного режима:", String(err)),
    );
    // Update local state to reflect the toggle immediately
    set((state) => ({
      torrents: state.torrents.map((t) =>
        t.id === id ? { ...t, sequential_download: enabled } : t,
      ),
    }));
  },
}));
