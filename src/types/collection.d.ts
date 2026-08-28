/** Status ids are user-extensible since schema v5; core ids seeded in DB. */
export type CollectionStatus = string;
export type CollectionType = "anime" | "movie" | "series" | "custom";
export type ProgressUnit = "episodes" | "seasons" | "minutes" | "pages";
export type Priority = "low" | "normal" | "high";

export interface CollectionStatusDef {
  id: CollectionStatus;
  label: string;
  color: string;
  order: number;
  isCore: boolean;
}

export interface CollectionExternalIds {
  anilist?: number;
  mal?: number;
  tmdb?: number;
  imdb?: string;
  shikimori?: number;
}

export interface CollectionItem {
  id: string;
  title: string;
  altTitles: string[];
  type: CollectionType;
  status: CollectionStatus;
  progressValue: number;
  progressTotal: number | null;
  progressUnit: ProgressUnit;
  durationMinutes: number | null;
  rating: number | null;
  priority: Priority;
  isFavorite: boolean;
  year: number | null;
  genres: string[];
  studio: string | null;
  description: string | null;
  notes: string | null;
  coverUrl: string | null;
  coverBlobId: string | null;
  thumbBlobId: string | null;
  externalIds: CollectionExternalIds;
  customFields: Record<string, unknown>;
  localPath: string | null;
  localKind: "file" | "folder" | null;
  startedAt: number | null;
  finishedAt: number | null;
  lastWatchedAt: number | null;
  rewatchCount: number;
  addedAt: number;
  updatedAt: number;
}

export interface CollectionReview {
  id: string;
  itemId: string | null;
  rating: number;
  comment: string;
  imageBlobId: string | null;
  createdAt: number;
  updatedAt: number;
  orphaned: boolean;
  snapshotTitle: string | null;
}

export type CustomFieldType = "text" | "number" | "select" | "date";

export interface CustomFieldDef {
  id: string;
  name: string;
  fieldType: CustomFieldType;
  options: string[] | null;
}

export interface CollectionStats {
  total: number;
  byStatus: Record<CollectionStatus, number>;
  avgRating: number | null;
  totalHours: number;
  favoriteCount: number;
  ratingDistribution: Record<number, number>;
}

export interface CollectionStore {
  selectedStatus: CollectionStatus | "all";
  searchQuery: string;
  sortBy: "date" | "name" | "rating";
  sortDir: "asc" | "desc";
  filters: CollectionFilters;
  activeSection: "library" | "statistics";
  groupByStatus: boolean;
  collapsedStatuses: Set<string>;
  setActiveSection: (section: CollectionStore["activeSection"]) => void;
  setSearchQuery: (query: string) => void;
  setSelectedStatus: (status: CollectionStore["selectedStatus"]) => void;
  setSort: (
    by: CollectionStore["sortBy"],
    dir: CollectionStore["sortDir"]
  ) => void;
  setFilters: (patch: Partial<CollectionFilters>) => void;
  setGroupByStatus: (groupByStatus: boolean) => void;
  toggleStatusCollapsed: (statusId: string) => void;
}

export interface CollectionFilters {
  ratingMin: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  provider: "any" | "anilist" | "tmdb" | "custom";
  linked: "any" | "yes" | "no";
  hasNote: "any" | "yes" | "no";
  hiddenStatuses?: string[];
  defaultStatus?: CollectionStatus;
}
