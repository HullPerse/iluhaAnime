export type {
  Anime,
  FilePriority,
  FolderNode,
  TorrentDetails,
  TorrentDetailComment,
  TorrentDetailField,
  TorrentDetailFile,
} from "./torrent";
export type {
  LanguageTag,
  SettingsScraper,
  SortKey,
  Source,
  SourceInfo,
  SearchFilters,
  SortDirection,
  SearchSuggestion,
  SearchSuggestionKind,
  SearchSuggestionOptions,
  AnilistSuggestionBoost,
  UnifiedIndexRow,
} from "./search";
export type { MediaTrack, VideoFileEntry } from "./fs";
export type {
  SettingsTab,
  FFMPEGStatus,
  ScanType,
  SettingsStore,
} from "./settings";
export type {
  SqliteDatabaseInfo,
  SqliteColumnInfo,
  SqliteTableInfo,
  SqliteRowsPage,
} from "./sqlite";
export type { Locale, TranslationVariables } from "./i18n";
export type { VideoStreamInfo } from "./player";
export type { PaginationProps, PaginationResult } from "./pagination";
export type { Category, CategoryEntry, CategoryStore } from "./category";
export type { UserImage } from "./image.userimage";
export type {
  ConvertConfig,
  UpscaleConfig,
  QueueItemStatus,
  JobType,
  UpscaleQueueItem,
  UpscaleProgressPayload,
  UpscaleQueueStore,
} from "./upscale";
export type {
  FranchiseCacheEntry,
  AppCacheRecord,
  RawAppCacheRecord,
  CacheStore,
} from "./cache";
export type {
  NotificationType,
  NotificationItem,
  DismissedEntry,
  NotificationStore,
} from "./notification";
export type { PersonalAnimeStats } from "./stats";
export type {
  VaultMediaFile,
  VaultIssue,
  VaultHealthReport,
  VaultOrganizationPlan,
  VaultEpisodeMatrixRow,
  VaultStoredMediaRecord,
  VaultMetadata,
} from "./vault";
export type {
  LocalAnimeCandidate,
  LocalAnimeRecommendation,
  LocalRecommendationInput,
} from "./recommendation";
export type { ThemeStore } from "./theme";

import type { ReactNode } from "react";

export interface ModalWindow {
  header: string;
  onClose: () => void;
  onBack?: () => void;
  className?: string;
  contentClassName?: string;
  hideHeader?: boolean;
  hideBackdrop?: boolean;
  modal?: boolean;
  children: ReactNode;
}

export type HexType = `#${string}`;

export interface FileSearchResult {
  path: string;
  name: string;
  size: number;
}

export type Item =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };
