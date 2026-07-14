import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsStore {
  dlLimit: number | null;
  ulLimit: number | null;
  notificationsEnabled: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
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
  showTorrentsInPlayer: boolean;
  modalAnimation: boolean;
  enable3dBorders: boolean;
  buttonPressEffect: boolean;
  wallpaperBlur: boolean;
  enableAnimations: boolean;
  showWallpaper: boolean;
  modalBackdropOpacity: number;
  customScrollbar: boolean;
  mediaPlayer: string;
  customPlayers: string[];
  savedFolderPaths: string[];
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
      showTorrentsInPlayer: true,
      modalAnimation: true,
      enable3dBorders: true,
      buttonPressEffect: true,
      wallpaperBlur: true,
      enableAnimations: true,
      showWallpaper: true,
      modalBackdropOpacity: 50,
      customScrollbar: true,
      mediaPlayer: "default",
      customPlayers: [],
      savedFolderPaths: [],

      patch: (partial) => set(partial),
    }),
    { name: "settings" },
  ),
);
