import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsStore {
  dlLimit: number | null;
  ulLimit: number | null;
  notificationsEnabled: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  animeNotifyMode: "none" | "inapp" | "system_when_open";
  defaultSearchSource: string;
  visibleSources: string[];
  resultsPerPage: number;
  anilistPageSize: number;
  anilistMaxPages: number;
  searchHistoryMaxItems: number;
  toastDuration: number;
  videoExtensions: string[];
  audioExtensions: string[];
  subtitleExtensions: string[];
  showTrackFiles: "hide" | "torrent" | "folders";
  modalAnimation: boolean;
  enable3dBorders: boolean;
  buttonPressEffect: boolean;
  wallpaperBlur: boolean;
  enableAnimations: boolean;
  showWallpaper: boolean;
  modalBackdropOpacity: number;
  customScrollbar: boolean;
  savedFolderPaths: string[];
  httpApiPort: number;
  ipv4Only: boolean;
  peerConnectTimeout: number;
  peerReadWriteTimeout: number;
  listenPort: number;
  enableUpnp: boolean;
  enableMdns: boolean;
  fastresumeEnabled: boolean;
  disablePersistence: boolean;
  patch: (partial: Partial<SettingsStore>) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      dlLimit: null,
      ulLimit: null,
      notificationsEnabled: true,
      notifyOnComplete: true,
      notifyOnError: true,
      animeNotifyMode: "none",
      defaultSearchSource: "erai-raws",
      visibleSources: ["erai-raws", "rutracker", "nyaa", "nekobt"],
      resultsPerPage: 20,
      anilistPageSize: 40,
      anilistMaxPages: 3,
      searchHistoryMaxItems: 5,
      toastDuration: 3000,
      videoExtensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "m2ts", "ogv", "3gp"],
      audioExtensions: ["mp3", "flac", "aac", "ogg", "wav", "opus", "m4a", "wma"],
      subtitleExtensions: ["srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs"],
      showTrackFiles: "hide",
      modalAnimation: true,
      enable3dBorders: true,
      buttonPressEffect: true,
      wallpaperBlur: true,
      enableAnimations: true,
      showWallpaper: true,
      modalBackdropOpacity: 50,
      customScrollbar: true,
      savedFolderPaths: [],
      httpApiPort: 11200,
      ipv4Only: false,
      peerConnectTimeout: 30,
      peerReadWriteTimeout: 30,
      listenPort: 0,
      enableUpnp: false,
      enableMdns: false,
      fastresumeEnabled: true,
      disablePersistence: false,

      patch: (partial) => set(partial),
    }),
    {
      name: "settings",
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0 && persistedState && typeof persistedState === "object") {
          const s = persistedState as Record<string, unknown>;
          if ("animeNotificationsEnabled" in s) {
            const old = s.animeNotificationsEnabled;
            (s as Record<string, unknown>).animeNotifyMode = old === true ? "system_when_open" : "none";
            delete (s as Record<string, unknown>).animeNotificationsEnabled;
          }
        }
        return persistedState as SettingsStore;
      },
    },
  ),
);
