import { create } from "zustand";
import { persist } from "zustand/middleware";

type FranchiseScope = "all" | "main";

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
  videoExtensions: string[];
  audioExtensions: string[];
  subtitleExtensions: string[];
  showTrackFiles: "hide" | "torrent" | "folders";
  modalAnimation: boolean;
  enable3dBorders: boolean;
  buttonPressEffect: boolean;
  enableAnimations: boolean;
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
  parseTitles: boolean;
  franchiseRelationScope: FranchiseScope;
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

      videoExtensions: [
        "mp4",
        "mkv",
        "avi",
        "mov",
        "webm",
        "flv",
        "wmv",
        "m4v",
        "mpg",
        "mpeg",
        "ts",
        "m2ts",
        "ogv",
        "3gp",
      ],
      audioExtensions: [
        "mp3",
        "flac",
        "aac",
        "ogg",
        "wav",
        "opus",
        "m4a",
        "wma",
      ],
      subtitleExtensions: [
        "srt",
        "ass",
        "ssa",
        "vtt",
        "sub",
        "idx",
        "sup",
        "pgs",
      ],
      showTrackFiles: "hide",
      modalAnimation: true,
      enable3dBorders: true,
      buttonPressEffect: true,
      enableAnimations: true,
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
      parseTitles: false,
      franchiseRelationScope: "all",

      patch: (partial) => set(partial),
    }),
    {
      name: "settings",
      version: 1,
      migrate: (persistedState: unknown, _version: number) => {
        return persistedState as SettingsStore;
      },
    },
  ),
);
