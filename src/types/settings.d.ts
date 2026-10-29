import type { AniListSort, AniTitlePreference } from "./anilist";
import type { Locale, TranslationKey } from "./i18n";
import type { ScreenshotFormat } from "./screenshot";
import type { AutocompleteMode, SearchType, TagToleranceKey } from "./search";
import type { StreamQuality } from "./stream";
import type { FileOrder, SpeedLimits } from "./torrent";

export type SettingsTab =
  | "general"
  | "search"
  | "torrent"
  | "theme"
  | "sqlite"
  | "notifications"
  | "keybinds"
  | "changelog";

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";

export type WindowEffect = "none" | "acrylic" | "mica" | "tabbed";

export interface SettingsStore {
  language: Locale;
  defaultDownloadDir: string | null;
  maxConcurrentDownloads: number;
  limits: SpeedLimits;
  speedSchedule: SpeedSchedule;
  themeSchedule: ThemeSchedule;
  notificationPopups: NotificationPopupMode;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  defaultSearchSource: string;
  visibleSources: string[];
  searchProxyUrls: Record<string, string>;
  webviewProxyEnabled: boolean;
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
  watcherDelay: WatcherDelay;
  scanThreads: number;
  /** Quality a stream starts at when the title has no remembered one. */
  streamDefaultQuality: StreamQuality;
  modalAnimation: boolean;
  enable3dBorders: boolean;
  buttonPressEffect: boolean;
  enableAnimations: boolean;
  modalBackdropOpacity: number;
  animateCounters: boolean;
  animateToasts: boolean;
  animateSections: boolean;
  animateModalContent: boolean;
  animateOsd: boolean;
  animateResultLists: boolean;
  animateTabSwitch: boolean;
  customScrollbar: boolean;
  customTitleBarEnabled: boolean;
  statusBarEnabled: boolean;
  fastLaunch: boolean;
  minimizeToTray: boolean;
  roundedWindowCorners: boolean;
  windowEffect: WindowEffect;
  windowTintOpacity: number | null;
  yorhaScanlinesEnabled: boolean;
  retroStyle: "classic" | "soft" | "high-contrast";
  uiDensity: "comfortable" | "compact";
  progressStyle: "blocks" | "solid";
  similarView: "rail" | "list";
  animeDetailWidth: "default" | "wide";
  vimMode: boolean;
  keybindOverrides: Record<string, string | null>;
  collectionGroupHeaderStyle: "torrent" | "folder";
  savedFolderPaths: string[];
  playerFolderHeights: Record<string, number>;
  /** Per-info-hash height of the torrent file list in the player route. */
  playerTorrentHeights: Record<string, number>;
  hiddenPlayerFolders: string[];
  hiddenPlayerTorrents: string[];
  httpApiPort: number;
  ipv4Only: boolean;
  peerConnectTimeout: number;
  peerReadWriteTimeout: number;
  listenPort: number;
  enableUpnp: boolean;
  dhtEnabled: boolean;
  pexEnabled: boolean;
  torrentProxyUrl: string | null;
  fileOrder: FileOrder;
  fastresumeEnabled: boolean;
  disablePersistence: boolean;
  /** Publish what is playing to the Discord client. Off until the user asks. */
  discordRpcEnabled: boolean;
  parseTitlesPlayer: boolean;
  parseTitlesTorrent: boolean;
  parseTitlesSearch: boolean;
  torrentCoverMode: TorrentCoverMode;
  torrentCoverModeManual: boolean;
  anilistReleaseNotifications: boolean;
  notifyNewEpisodes: boolean;
  notifyStatusChanges: boolean;
  notifyMediaStatus: boolean;
  notifySubscribedReplies: boolean;
  notifyMediaMerge: boolean;
  notifySequel: boolean;
  notifyTorrentHealth: boolean;
  notifyUpscaleDone: boolean;
  notifyModelDownloads: boolean;
  notifyBackup: boolean;
  notifyScanErrors: boolean;
  anilistPollIntervalMin: number;
  anilistNotifyLists: string[] | null;
  anilistListSort: AniListSort;
  anilistGroupByStatus: boolean;
  anilistCollapsedLists: string[];
  anilistDisplayMode: "scroll" | "pagination";
  sqliteBrowserEnabled: boolean;
  sqliteShowImages: boolean;
  collectionTabEnabled: boolean;
  anilistTabEnabled: boolean;
  searchTabEnabled: boolean;
  torrentTabEnabled: boolean;
  playerTabEnabled: boolean;
  streamTabEnabled: boolean;
  gameTabUnlocked: boolean;
  rememberLastTab: boolean;
  gameVolume: number;
  tmdbKeySet: boolean;
  tmdbPendingKey: string | null;
  tmdbProxyUrl: string | null;
  anilistProxyUrl: string | null;
  /** SOCKS/HTTP proxy for the AnimeLib API and its Kodik resolver. */
  animelibProxyUrl: string | null;
  anilistTitleLanguage: AniTitlePreference;
  anilistAdultContent: boolean;
  ffmpegSource: "essentials" | "github" | "github-mirror";
  searchSymSpellEnabled: boolean;
  searchIntentEnabled: boolean;
  searchMascotEnabled: boolean;
  tagTolerances: Record<TagToleranceKey, number>;
  searchType: SearchType;
  playerType: "default" | "modern";
  playerContextMenu: boolean;
  selectedDitherId: string | null;
  appFont: string | null;
  wallpaperFilters: WallpaperDisplayFilters;
  wallpaperShadow: WallpaperShadow;
  wallpaperScanlines: boolean;
  searchShadow: WallpaperShadow;
  screenshotDir: string | null;
  screenshotFormat: ScreenshotFormat;
  screenshotOpenFolder: boolean;
  patch: (partial: Partial<SettingsStore>) => void;
}

export interface WallpaperCanvasProps {
  src: string;
  alt: string;
  className?: string;
  filter?: string;
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
  proxyUrl: string | null;
  fileOrder: FileOrder;
}

export type TabId =
  | "search"
  | "torrent"
  | "player"
  | "anilist"
  | "collection"
  | "settings"
  | "game"
  | "stream";

export type TorrentCoverMode = "off" | "pages" | "full";

export type NotificationPopupMode = "off" | "system" | "inapp" | "both";

export type WatcherDelay = "fast" | "calm";

export interface SpeedSchedule {
  enabled: boolean;
  dayStart: string;
  nightStart: string;
  dayDownload: number | null;
  dayUpload: number | null;
  nightDownload: number | null;
  nightUpload: number | null;
}

export interface ThemeSchedule {
  enabled: boolean;
  dayStart: string;
  nightStart: string;
  dayTheme: string;
  nightTheme: string;
}

export type SettingsDefaults = Omit<
  SettingsStore,
  | "language"
  | "hidePlayerFolder"
  | "unhidePlayerFolder"
  | "hidePlayerTorrent"
  | "unhidePlayerTorrent"
  | "setPlayerFolderHeight"
  | "setPlayerTorrentHeight"
  | "patch"
>;

export type TabSettings = Pick<
  SettingsStore,
  | "collectionTabEnabled"
  | "anilistTabEnabled"
  | "searchTabEnabled"
  | "torrentTabEnabled"
  | "playerTabEnabled"
  | "streamTabEnabled"
  | "gameTabUnlocked"
>;

export type ChangelogScope =
  | "upscale"
  | "player"
  | "torrents"
  | "collection"
  | "anilist"
  | "settings"
  | "app"
  | "search"
  | "game";

export interface ChangelogEntry {
  key: TranslationKey;
  scope: ChangelogScope;
}
