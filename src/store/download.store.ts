import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

import type { FilePriority } from "@/types";

export interface TorrentInfo {
  id: number;
  name: string;
  info_hash: string;
  total_bytes: number;
  progress_bytes: number;
  uploaded_bytes: number;
  download_speed: number;
  upload_speed: number;
  peers_connected: number;
  progress: number;
  state: string;
  eta_secs: number | null;
  finished: boolean;
  error: string | null;
  save_dir: string;
  sequential_download: boolean;
}

export interface TorrentFileInfo {
  index: number;
  name: string;
  size: number;
  completed: boolean;
  selected: boolean;
  priority: FilePriority;
}

export interface PickerTorrent {
  magnet: string;
  id: number;
  name: string;
  files: TorrentFileInfo[];
  conflictingFiles: string[];
  hasCommonFolder: boolean;
}

interface TorrentStore {
  torrents: TorrentInfo[];
  dlLimit: number | null;
  ulLimit: number | null;
  lastSaveDir: string;
  pendingTorrent: PickerTorrent | null;
  preparingTorrent: boolean;
  torrentFilesMap: Record<number, TorrentFileInfo[]>;

  init: () => Promise<() => void>;
  prepareTorrentDownload: (magnet: string) => Promise<void>;
  confirmDownload: (selectedIndices: number[], saveDir: string, subFolder: string | undefined) => Promise<void>;
  cancelDownload: () => Promise<void>;
  pauseTorrent: (id: number) => Promise<void>;
  resumeTorrent: (id: number) => Promise<void>;
  removeTorrent: (id: number, deleteFiles: boolean) => Promise<void>;
  setSpeedLimits: (dlKbps: number | null, ulKbps: number | null) => Promise<void>;
  loadTorrentFiles: (id: number) => Promise<void>;
  updateTorrentOnlyFiles: (id: number, indices: number[]) => Promise<void>;
  setFilePriority: (id: number, fileIndices: number[], priority: FilePriority) => Promise<void>;
  setSequentialDownload: (id: number, enabled: boolean) => Promise<void>;
}

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
    const initial = await invoke<TorrentInfo[]>("list_torrents").catch(() => []);
    set({ torrents: initial });

    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }

    const unlisten = await listen<TorrentInfo[]>("torrents-update", (event) => {
      set({ torrents: event.payload });
    });

    return unlisten;
  },

  prepareTorrentDownload: async (magnet: string) => {
    let saveDir = get().lastSaveDir;
    if (!saveDir) {
      const dir = await open({ directory: true, title: "Выберите папку для сохранения" });
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
      console.error("Failed to get torrent info:", err);
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

  confirmDownload: async (selectedIndices: number[], saveDir: string, subFolder: string | undefined) => {
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
    set({ lastSaveDir: saveDir, pendingTorrent: null });

    if (pending.id) {
      await invoke("remove_torrent", { id: pending.id, deleteFiles: false }).catch((err) => console.error("Failed to clean up pending torrent:", err));
    }
    await invoke("start_torrent_download", {
      magnet: pending.magnet,
      saveDir,
      onlyFiles: selectedIndices.length === pending.files.length ? null : selectedIndices,
      subFolder: subFolder || null,
    }).catch((err) => console.error("Failed to start torrent:", err));
  },

  cancelDownload: async () => {
    const pending = get().pendingTorrent;
    set({ preparingTorrent: false, pendingTorrent: null });
    if (!pending) return;
    if (pending.id) {
      await invoke("remove_torrent", { id: pending.id, deleteFiles: false }).catch((err) => console.error("Failed to cancel pending torrent:", err));
    }
  },

  pauseTorrent: async (id: number) => {
    await invoke("pause_torrent", { id }).catch((err) => console.error("Failed to pause torrent:", err));
  },

  resumeTorrent: async (id: number) => {
    await invoke("resume_torrent", { id }).catch((err) => console.error("Failed to resume torrent:", err));
  },

  removeTorrent: async (id: number, deleteFiles: boolean) => {
    await invoke("remove_torrent", { id, deleteFiles }).catch((err) => console.error("Failed to remove torrent:", err));
  },

  setSpeedLimits: async (dlKbps: number | null, ulKbps: number | null) => {
    set({ dlLimit: dlKbps, ulLimit: ulKbps });
    const dlBps = dlKbps !== null ? dlKbps * 1024 : null;
    const ulBps = ulKbps !== null ? ulKbps * 1024 : null;
    await invoke("set_global_speed_limits", { downloadBps: dlBps, uploadBps: ulBps }).catch((err) => console.error("Failed to set speed limits:", err));
  },

  loadTorrentFiles: async (id: number) => {
    const files = await invoke<TorrentFileInfo[]>("get_running_torrent_files", { id }).catch(() => null);
    if (files) {
      set((state) => ({
        torrentFilesMap: { ...state.torrentFilesMap, [id]: files },
      }));
    }
  },

  updateTorrentOnlyFiles: async (id: number, indices: number[]) => {
    await invoke("update_torrent_only_files", { id, onlyFiles: indices }).catch((err) => console.error("Failed to update torrent files:", err));
  },

  setFilePriority: async (id: number, fileIndices: number[], priority: FilePriority) => {
    await invoke("set_file_priority", { id, fileIndices, priority }).catch((err) => console.error("Failed to set file priority:", err));
    // Refresh files to reflect the change
    const state = useTorrentStore.getState();
    if (state.torrentFilesMap[id]) {
      state.loadTorrentFiles(id);
    }
  },

  setSequentialDownload: async (id: number, enabled: boolean) => {
    await invoke("set_sequential_download", { id, enabled }).catch((err) => console.error("Failed to set sequential download:", err));
    // Update local state to reflect the toggle immediately
    set((state) => ({
      torrents: state.torrents.map((t) =>
        t.id === id ? { ...t, sequential_download: enabled } : t,
      ),
    }));
  },
}));
