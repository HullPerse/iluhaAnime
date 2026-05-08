import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

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
}

interface TorrentStore {
  torrents: TorrentInfo[];
  init: () => Promise<() => void>;
  startTorrent: (magnet: string) => Promise<void>;
  pauseTorrent: (id: number) => Promise<void>;
  resumeTorrent: (id: number) => Promise<void>;
  removeTorrent: (id: number) => Promise<void>;
}

export const useTorrentStore = create<TorrentStore>((set) => ({
  torrents: [],

  init: async () => {
    const initial = await invoke<TorrentInfo[]>("list_torrents").catch(() => []);
    set({ torrents: initial });

    const unlisten = await listen<TorrentInfo[]>("torrents-update", (event) => {
      set({ torrents: event.payload });
    });

    return unlisten;
  },

  startTorrent: async (magnet: string) => {
    const dir = await open({ directory: true, title: "Выберите папку для сохранения" });
    if (!dir) return;
    await invoke("start_torrent_download", { magnet, saveDir: dir }).catch(
      (err) => console.error("Failed to start torrent:", err),
    );
  },

  pauseTorrent: async (id: number) => {
    await invoke("pause_torrent", { id }).catch(() => {});
  },

  resumeTorrent: async (id: number) => {
    await invoke("resume_torrent", { id }).catch(() => {});
  },

  removeTorrent: async (id: number) => {
    await invoke("remove_torrent", { id }).catch(() => {});
  },
}));
