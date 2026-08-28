import type { SettingsStore } from "@/types/settings";

export type SettingsDefaults = Omit<
  SettingsStore,
  | "language"
  | "hidePlayerFolder"
  | "unhidePlayerFolder"
  | "hidePlayerTorrent"
  | "unhidePlayerTorrent"
  | "patch"
>;

export const DEFAULT_SETTINGS: SettingsDefaults = {
  anilistMaxPages: 3,
  anilistPageSize: 40,
  anilistReleaseNotifications: true,
  toastDuration: 3000,
  audioExtensions: ["mp3", "flac", "aac", "ogg", "wav", "opus", "m4a", "wma"],
  buttonPressEffect: true,
  customScrollbar: true,
  defaultSearchSource: "erai-raws",
  disablePersistence: false,
  dlLimit: null,
  enable3dBorders: true,
  enableAnimations: false,
  enableUpnp: false,
  fastresumeEnabled: true,
  ffmpegSource: "essentials",
  hiddenPlayerFolders: [],
  hiddenPlayerTorrents: [],
  httpApiPort: 11200,
  ipv4Only: false,
  listenPort: 0,
  modalAnimation: false,
  modalBackdropOpacity: 50,
  notificationsEnabled: true,
  notifyOnComplete: true,
  notifyOnError: true,
  parseTitles: false,
  peerConnectTimeout: 30,
  peerReadWriteTimeout: 30,
  resultsPerPage: 20,
  retroStyle: "classic",
  savedFolderPaths: [],
  searchHistoryMaxItems: 100,
  autocompleteMode: "both",
  anilistSuggestionBoost: "subtle",
  showTrackFiles: "hide",
  sqliteBrowserEnabled: false,
  sqliteShowImages: false,
  subtitleExtensions: ["srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs"],
  uiDensity: "comfortable",
  ulLimit: null,
  vaultTabEnabled: false,
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
  visibleSources: ["erai-raws", "rutracker", "nyaa", "nekobt"],
  tmdbApiKey: null as string | null,
  collectionTabEnabled: true,
};
