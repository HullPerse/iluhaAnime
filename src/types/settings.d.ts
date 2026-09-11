import type { Locale, TranslationKey } from "./i18n";
import type { AutocompleteMode, SearchType } from "./search";
import type { SpeedLimits } from "./torrent";

export type SettingsTab =
  | "general"
  | "search"
  | "torrent"
  | "theme"
  | "sqlite"
  | "notifications"
  | "changelog";

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";

export interface SettingsStore {
  language: Locale;
  limits: SpeedLimits;
  notificationsEnabled: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  defaultSearchSource: string;
  visibleSources: string[];
  searchProxyUrls: Record<string, string>;
  resultsPerPage: number;
  pageSize: number;
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
  collectionGroupHeaderStyle: "torrent" | "folder";
  savedFolderPaths: string[];
  playerFolderHeights: Record<string, number>;
  hiddenPlayerFolders: string[];
  hiddenPlayerTorrents: string[];
  hidePlayerFolder: (path: string) => void;
  unhidePlayerFolder: (path: string) => void;
  hidePlayerTorrent: (infoHash: string) => void;
  unhidePlayerTorrent: (infoHash: string) => void;
  setPlayerFolderHeight: (path: string, height: number | null) => void;
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
  notifyNewEpisodes: boolean;
  notifyStatusChanges: boolean;
  anilistPollIntervalMin: number;
  anilistNotifyLists: string[] | null;
  sqliteBrowserEnabled: boolean;
  sqliteShowImages: boolean;
  collectionTabEnabled: boolean;
  anilistTabEnabled: boolean;
  searchTabEnabled: boolean;
  torrentTabEnabled: boolean;
  playerTabEnabled: boolean;
  tmdbKeySet: boolean;
  tmdbPendingKey: string | null;
  tmdbProxyUrl: string | null;
  anilistProxyUrl: string | null;
  ffmpegSource: "essentials" | "github" | "github-mirror";
  searchSymSpellEnabled: boolean;
  searchIntentEnabled: boolean;
  searchType: SearchType;
  selectedDitherId: string | null;
  appFont: string | null;
  wallpaperFilters: WallpaperDisplayFilters;
  wallpaperShadow: WallpaperShadow;
  searchShadow: WallpaperShadow;
  patch: (partial: Partial<SettingsStore>) => void;
}

export interface WallpaperDisplayFilters {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  opacity: number;
}

export interface WallpaperShadowSides {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface WallpaperShadow {
  sides: WallpaperShadowSides;
  intensity: number;
  color: string;
  length: number;
  softness: number;
}

export interface SessionConfigPayload {
  fastresume: boolean;
  ipv4Only: boolean;
  peerConnectTimeout: number;
  peerReadWriteTimeout: number;
  listenPort: number;
  enableUpnp: boolean;
  disablePersistence: boolean;
}

export type TabId =
  | "search"
  | "torrent"
  | "player"
  | "anilist"
  | "collection"
  | "settings";

export type SettingsDefaults = Omit<
  SettingsStore,
  | "language"
  | "hidePlayerFolder"
  | "unhidePlayerFolder"
  | "hidePlayerTorrent"
  | "unhidePlayerTorrent"
  | "setPlayerFolderHeight"
  | "patch"
>;

export type TabSettings = Pick<
  SettingsStore,
  | "collectionTabEnabled"
  | "anilistTabEnabled"
  | "searchTabEnabled"
  | "torrentTabEnabled"
  | "playerTabEnabled"
>;

export type ChangelogScope =
  | "upscale"
  | "player"
  | "torrents"
  | "collection"
  | "anilist"
  | "settings"
  | "app";

export interface ChangelogEntry {
  key: TranslationKey;
  scope: ChangelogScope;
}
