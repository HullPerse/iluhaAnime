import type { Locale } from "./i18n";
import type { AutocompleteMode } from "./search";

export type SettingsTab = "general" | "search" | "torrent" | "theme" | "sqlite";

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";

export type ScanType = { current: number; total: number } | null;

export interface SettingsStore {
  language: Locale;
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
  autocompleteMode: AutocompleteMode;
  anilistSuggestionBoost: "off" | "subtle" | "strong";
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
  retroStyle: "classic" | "soft" | "high-contrast";
  uiDensity: "comfortable" | "compact";
  savedFolderPaths: string[];
  hiddenPlayerFolders: string[];
  hiddenPlayerTorrents: string[];
  hidePlayerFolder: (path: string) => void;
  unhidePlayerFolder: (path: string) => void;
  hidePlayerTorrent: (infoHash: string) => void;
  unhidePlayerTorrent: (infoHash: string) => void;
  httpApiPort: number;
  ipv4Only: boolean;
  peerConnectTimeout: number;
  peerReadWriteTimeout: number;
  listenPort: number;
  enableUpnp: boolean;
  fastresumeEnabled: boolean;
  disablePersistence: boolean;
  parseTitles: boolean;
  anilistReleaseNotifications: boolean;
  sqliteBrowserEnabled: boolean;
  sqliteShowImages: boolean;
  vaultTabEnabled: boolean;
  collectionTabEnabled: boolean;
  ffmpegSource: "essentials" | "github" | "github-mirror";
  toastDuration: number;
  patch: (partial: Partial<SettingsStore>) => void;
}
