import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsStore {
  autoHideDelay: number;
  subtitleFontSize: number;
  subtitleFontFamily: string;
  subtitleColor: string;
  subtitleBgOpacity: number;
  subtitleBgColor: string;
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
  continueWatchingMax: number;
  toastDuration: number;
  autoCleanTempFiles: boolean;
  videoExtensions: string[];
  audioExtensions: string[];
  subtitleExtensions: string[];
  showTrackFiles: "hide" | "torrent" | "folders";
  preferredAudioLangs: string[];
  preferredAudioPatterns: string[];
  preferredSubLangs: string[];
  preferredSubPatterns: string[];
  preferForcedSubs: boolean;
  fallbackToFirstTrack: boolean;
  afterPlaybackAction: "next" | "stop" | "repeat_one";
  modalAnimation: boolean;
  enable3dBorders: boolean;
  buttonPressEffect: boolean;
  wallpaperBlur: boolean;
  enableAnimations: boolean;
  showWallpaper: boolean;
  modalBackdropOpacity: number;
  customScrollbar: boolean;

  patch: (partial: Partial<SettingsStore>) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      autoHideDelay: 3000,
      subtitleFontSize: 18,
      subtitleFontFamily: "Arial",
      subtitleColor: "#ffffff",
      subtitleBgOpacity: 0,
      subtitleBgColor: "#000000",
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
      continueWatchingMax: 3,
      toastDuration: 3000,
      autoCleanTempFiles: true,
      videoExtensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "m2ts", "ogv", "3gp"],
      audioExtensions: ["mp3", "flac", "aac", "ogg", "wav", "opus", "m4a", "wma"],
      subtitleExtensions: ["srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs"],
      showTrackFiles: "hide",
      preferredAudioLangs: ["jpn", "ja"],
      preferredAudioPatterns: [],
      preferredSubLangs: ["eng", "en"],
      preferredSubPatterns: [],
      preferForcedSubs: true,
      fallbackToFirstTrack: true,
      afterPlaybackAction: "next",
      modalAnimation: true,
      enable3dBorders: true,
      buttonPressEffect: true,
      wallpaperBlur: true,
      enableAnimations: true,
      showWallpaper: true,
      modalBackdropOpacity: 50,
      customScrollbar: true,

      patch: (partial) => set(partial),
    }),
    { name: "settings" },
  ),
);
