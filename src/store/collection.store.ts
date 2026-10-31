import { DEFAULT_FILTERS } from "@/config/anilist/collectionFilters.config";
import { attemptSync } from "@/lib/core/attempt.utils";
import { bindMirroredAtom, createPersistedStoreContext } from "@/lib/core/persisted.utils";
import type {
  CollectionFilters,
  CollectionStatus,
  CollectionStore,
  CollectionType,
  WizardPrefill,
} from "@/types/anilist/collection";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";

export const COLLECTION_SCHEMA_VERSION = 9;

const SORT_KEYS = ["date", "name", "rating", "year"] as const;
const VIEW_MODES = ["grid", "list"] as const;
const MEDIA_TYPES = ["anime", "movie", "series", "custom"] as const;
const PROVIDERS = ["any", "anilist", "tmdb", "custom"] as const;
const YES_NO_ANY = ["any", "yes", "no"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

function toSet(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === "string"));
  if (value instanceof Set) {
    return new Set([...value].filter((id): id is string => typeof id === "string"));
  }
  return new Set<string>();
}

function readFilters(value: unknown): CollectionFilters {
  const filters: CollectionFilters = { ...DEFAULT_FILTERS };
  if (!isRecord(value)) return filters;
  if (value.ratingMin === null || typeof value.ratingMin === "number") {
    filters.ratingMin = value.ratingMin;
  }
  if (value.ratingMax === null || typeof value.ratingMax === "number") {
    filters.ratingMax = value.ratingMax;
  }
  if (value.yearFrom === null || typeof value.yearFrom === "number") {
    filters.yearFrom = value.yearFrom;
  }
  if (value.yearTo === null || typeof value.yearTo === "number") {
    filters.yearTo = value.yearTo;
  }
  if (isOneOf(value.provider, PROVIDERS)) filters.provider = value.provider;
  if (isOneOf(value.linked, YES_NO_ANY)) filters.linked = value.linked;
  if (isOneOf(value.hasNote, YES_NO_ANY)) filters.hasNote = value.hasNote;
  if (Array.isArray(value.mediaTypes)) {
    filters.mediaTypes = value.mediaTypes.filter(
      (type): type is CollectionType => isOneOf(type, MEDIA_TYPES)
    );
  }
  if (Array.isArray(value.genres)) {
    filters.genres = value.genres.filter((genre): genre is string => typeof genre === "string");
  }
  if (Array.isArray(value.hiddenStatuses)) {
    filters.hiddenStatuses = value.hiddenStatuses.filter(
      (status): status is string => typeof status === "string"
    );
  }
  if (typeof value.defaultStatus === "string") filters.defaultStatus = value.defaultStatus;
  return filters;
}

function readWizardPrefill(value: unknown): WizardPrefill | null {
  if (!isRecord(value)) return null;
  const title = value.title;
  const status = value.status;
  const coverUrl = value.coverUrl;
  const rating = value.rating;
  const scoreOrigin = value.scoreOrigin;
  if (typeof title !== "string" || typeof status !== "string") return null;
  if (coverUrl !== null && typeof coverUrl !== "string") return null;
  if (!(rating === undefined || rating === null || typeof rating === "number")) return null;
  if (
    !(scoreOrigin === undefined || scoreOrigin === null || typeof scoreOrigin === "string")
  ) {
    return null;
  }
  const prefill: WizardPrefill = { title, coverUrl, status };
  if (rating !== undefined) prefill.rating = rating;
  if (scoreOrigin !== undefined) prefill.scoreOrigin = scoreOrigin;
  return prefill;
}

type CollectionActionKeys =
  | "setSearchQuery"
  | "setSelectedStatus"
  | "setSort"
  | "setFilters"
  | "setGroupByStatus"
  | "toggleStatusCollapsed"
  | "setViewMode"
  | "setDisplayMode"
  | "requestWizardPrefill"
  | "consumeWizardPrefill";

export type CollectionData = Omit<CollectionStore, CollectionActionKeys>;
export type CollectionAtoms = { [K in keyof CollectionData]: Cell<CollectionData[K]> };

const DEFAULT_COLLECTION_DATA: CollectionData = {
  selectedStatus: "all",
  searchQuery: "",
  sortBy: "date",
  sortDir: "desc",
  filters: { ...DEFAULT_FILTERS },
  groupByStatus: false,
  collapsedStatuses: new Set<string>(),
  viewMode: "grid",
  displayMode: "pagination",
  wizardPrefill: null,
};

function readCollectionData(raw: Record<string, unknown>, version: number): CollectionData {
  return {
    selectedStatus: typeof raw.selectedStatus === "string" ? raw.selectedStatus : "all",
    searchQuery: typeof raw.searchQuery === "string" ? raw.searchQuery : "",
    sortBy: isOneOf(raw.sortBy, SORT_KEYS) ? raw.sortBy : "date",
    sortDir: raw.sortDir === "asc" ? "asc" : "desc",
    filters: readFilters(raw.filters),
    groupByStatus: version < 4 ? false : Boolean(raw.groupByStatus),
    collapsedStatuses: toSet(raw.collapsedStatuses),
    viewMode: version < 4 ? "grid" : isOneOf(raw.viewMode, VIEW_MODES) ? raw.viewMode : "grid",
    displayMode: version < 4 ? "pagination" : raw.displayMode === "scroll" ? "scroll" : "pagination",
    wizardPrefill: readWizardPrefill(raw.wizardPrefill),
  };
}

export function migrateCollectionData(persistedState: unknown, version: number): CollectionData {
  if (!isRecord(persistedState)) {
    return { ...DEFAULT_COLLECTION_DATA, collapsedStatuses: new Set<string>() };
  }
  return readCollectionData(persistedState, version);
}

function readLegacyCollection(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("collection-ui"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  const version = typeof parsed.version === "number" ? parsed.version : 0;
  const [migrated, migrateError] = attemptSync(() => migrateCollectionData(state, version));
  if (migrateError !== null) return null;
  return { data: { ...migrated }, schemaVersion: COLLECTION_SCHEMA_VERSION };
}

export interface CollectionSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface CollectionSignalStore {
  atoms: CollectionAtoms;
  persistor: Persistor;
  subscribeAll: (fn: () => void) => () => void;
  setSearchQuery: (searchQuery: string) => void;
  setSelectedStatus: (selectedStatus: CollectionData["selectedStatus"]) => void;
  setSort: (sortBy: CollectionData["sortBy"], sortDir: CollectionData["sortDir"]) => void;
  setFilters: (patch: Partial<CollectionFilters>) => void;
  setGroupByStatus: (groupByStatus: boolean) => void;
  toggleStatusCollapsed: (statusId: CollectionStatus) => void;
  setViewMode: (viewMode: CollectionData["viewMode"]) => void;
  setDisplayMode: (displayMode: CollectionData["displayMode"]) => void;
  requestWizardPrefill: (prefill: WizardPrefill) => void;
  consumeWizardPrefill: () => void;
}

export function createCollectionSignalStore(
  options: CollectionSignalOptions = {}
): CollectionSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "collection-ui",
    short: "collection",
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyCollection(get),
  });

  const persisted = persistor.read();
  const persistedData = persisted?.data ?? {};
  const data: CollectionData = {
    ...DEFAULT_COLLECTION_DATA,
    ...readCollectionData(persistedData, COLLECTION_SCHEMA_VERSION),
  };
  const writeMirror: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    writeMirror[key] = value instanceof Set ? [...value] : value;
  }
  const atoms: CollectionAtoms = {
    selectedStatus: bindMirroredAtom(store, "selectedStatus", data.selectedStatus, writeMirror),
    searchQuery: bindMirroredAtom(store, "searchQuery", data.searchQuery, writeMirror),
    sortBy: bindMirroredAtom(store, "sortBy", data.sortBy, writeMirror),
    sortDir: bindMirroredAtom(store, "sortDir", data.sortDir, writeMirror),
    filters: bindMirroredAtom(store, "filters", data.filters, writeMirror),
    groupByStatus: bindMirroredAtom(store, "groupByStatus", data.groupByStatus, writeMirror),
    collapsedStatuses: bindMirroredAtom(
      store,
      "collapsedStatuses",
      data.collapsedStatuses,
      writeMirror,
      (value) => [...value]
    ),
    viewMode: bindMirroredAtom(store, "viewMode", data.viewMode, writeMirror),
    displayMode: bindMirroredAtom(store, "displayMode", data.displayMode, writeMirror),
    wizardPrefill: bindMirroredAtom(store, "wizardPrefill", data.wizardPrefill, writeMirror),
  };

  store.subscribeAll(() => {
    persistor.write(persistedSnapshot());
  });

  function persistedSnapshot(): Record<string, unknown> {
    const rest = { ...writeMirror };
    delete rest.wizardPrefill;
    return rest;
  }

  const handle: CollectionSignalStore = {
    atoms,
    persistor,
    subscribeAll: (fn) => store.subscribeAll(fn),
    setSearchQuery: (searchQuery) => atoms.searchQuery.set(searchQuery),
    setSelectedStatus: (selectedStatus) => atoms.selectedStatus.set(selectedStatus),
    setSort: (sortBy, sortDir) => {
      atoms.sortBy.set(sortBy);
      atoms.sortDir.set(sortDir);
    },
    setFilters: (patch) => atoms.filters.set({ ...atoms.filters.get(), ...patch }),
    setGroupByStatus: (groupByStatus) => atoms.groupByStatus.set(groupByStatus),
    toggleStatusCollapsed: (statusId) => {
      const collapsedStatuses = atoms.collapsedStatuses.get();
      const next = new Set(collapsedStatuses);
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      atoms.collapsedStatuses.set(next);
    },
    setViewMode: (viewMode) => atoms.viewMode.set(viewMode),
    setDisplayMode: (displayMode) => atoms.displayMode.set(displayMode),
    requestWizardPrefill: (prefill) => atoms.wizardPrefill.set(prefill),
    consumeWizardPrefill: () => atoms.wizardPrefill.set(null),
  };

  finishAdopt(() => persistedSnapshot(), { remove: "collection-ui" });

  return handle;
}

const collection = createCollectionSignalStore();

export const collectionAtoms = collection.atoms;
export const collectionPersistor = collection.persistor;
export function subscribeCollection(listener: () => void): () => void {
  return collection.subscribeAll(listener);
}
export const setCollectionSearchQuery = collection.setSearchQuery;
export const setCollectionSelectedStatus = collection.setSelectedStatus;
export const setCollectionSort = collection.setSort;
export const setCollectionFilters = collection.setFilters;
export const setCollectionGroupByStatus = collection.setGroupByStatus;
export const toggleCollectionStatusCollapsed = collection.toggleStatusCollapsed;
export const setCollectionViewMode = collection.setViewMode;
export const setCollectionDisplayMode = collection.setDisplayMode;
export const requestWizardPrefill = collection.requestWizardPrefill;
export const consumeWizardPrefill = collection.consumeWizardPrefill;

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => collection.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") collection.persistor.flush();
  });
}
