import { DEFAULT_FILTERS } from "@/config/collection/filters.config";
import { createPersistor, persistKey, type Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type {
  CollectionFilters,
  CollectionStatus,
  CollectionStore,
  WizardPrefill,
} from "@/types/collection";

export const COLLECTION_SCHEMA_VERSION = 9;

function toSet(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value as string[]);
  if (value instanceof Set) return value;
  return new Set<string>();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function resolveFilters(state: Partial<CollectionStore>, version: number): CollectionFilters {
  let filters = (state.filters as CollectionFilters | undefined) ?? { ...DEFAULT_FILTERS };
  if (version < 8) filters = { ...DEFAULT_FILTERS, ...filters } as CollectionFilters;
  return filters;
}

function migrateFromLegacy(
  state: Partial<CollectionStore> & { collapsedStatuses?: unknown }
): CollectionStore {
  return {
    selectedStatus: state.selectedStatus ?? "all",
    searchQuery: state.searchQuery ?? "",
    sortBy: state.sortBy ?? "date",
    sortDir: state.sortDir ?? "desc",
    filters: (state.filters as CollectionFilters | undefined) ?? { ...DEFAULT_FILTERS },
    groupByStatus: false,
    collapsedStatuses: toSet(state.collapsedStatuses),
  } as CollectionStore;
}

function migrateCurrent(
  state: Partial<CollectionStore> & { collapsedStatuses?: unknown },
  version: number
): CollectionStore {
  return {
    selectedStatus: state.selectedStatus ?? "all",
    searchQuery: state.searchQuery ?? "",
    sortBy: state.sortBy ?? "date",
    sortDir: state.sortDir ?? "desc",
    filters: resolveFilters(state, version),
    groupByStatus: Boolean(state.groupByStatus),
    collapsedStatuses: toSet(state.collapsedStatuses),
    viewMode: (state.viewMode as CollectionStore["viewMode"]) ?? "grid",
    displayMode: state.displayMode === "scroll" ? "scroll" : "pagination",
  } as CollectionStore;
}

export function migrateCollectionData(persistedState: unknown, version: number): CollectionStore {
  if (!isRecord(persistedState)) return {} as CollectionStore;
  const state = persistedState as Partial<CollectionStore> & {
    collapsedStatuses?: unknown;
  };
  if (version < 4) return migrateFromLegacy(state);
  return migrateCurrent(state, version);
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

function readLegacyCollection(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("collection-ui"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown; version?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  const version = typeof envelope.version === "number" ? envelope.version : 0;
  if (!state || typeof state !== "object") return null;
  const [migrated, migrateError] = attemptSync(() =>
    migrateCollectionData(state, version)
  );
  if (migrateError !== null || !migrated || typeof migrated !== "object") return null;
  return {
    data: migrated as unknown as Record<string, unknown>,
    schemaVersion: COLLECTION_SCHEMA_VERSION,
  };
}

function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
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
  const getStorage = options.getStorage ?? defaultGetStorage;
  const store = createSignalStore();
  let adoptedFromLegacy = false;
  const persistor = createPersistor({
    storeName: "collection-ui",
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    getStorage,
    debounceMs: options.debounceMs,
    fallback: () => {
      const migrated = readLegacyCollection(getStorage);
      if (migrated) adoptedFromLegacy = true;
      return migrated;
    },
    onError: (scope, error) =>
      reportBackgroundError(`collection.signal.${scope}`, error as Error),
  });

  const persisted = persistor.read();
  const persistedData = (persisted?.data ?? {}) as Partial<CollectionData> & {
    collapsedStatuses?: unknown;
  };
  const data: CollectionData = {
    ...DEFAULT_COLLECTION_DATA,
    ...persistedData,
    collapsedStatuses: toSet(persistedData.collapsedStatuses),
  };
  const writeMirror: Record<string, unknown> = {};
  const atoms = {} as CollectionAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const cell = store.atom(key, source[key]);
    const value = source[key];
    writeMirror[key] = value instanceof Set ? [...value] : value;
    const handle: Cell<unknown> = {
      id: cell.id,
      get: cell.get,
      set: (next) => {
        cell.set(next);
        writeMirror[key] = next instanceof Set ? [...next] : next;
      },
      update: (fn) => {
        const next = (fn as (prev: unknown) => unknown)(cell.get());
        cell.set(next);
        writeMirror[key] = next instanceof Set ? [...next] : next;
      },
      subscribe: cell.subscribe,
    };
    sink[key] = handle;
  }

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

  if (adoptedFromLegacy) {
    persistor.write(persistedSnapshot());
    persistor.flush();
    const [storage, storageError] = attemptSync(() => getStorage());
    if (storageError !== null) reportBackgroundError("collection.signal.adopt", storageError);
    else {
      const [adopted, adoptError] = attemptSync(() =>
        storage?.getItem(persistKey("collection-ui"))
      );
      if (adoptError !== null) reportBackgroundError("collection.signal.adopt", adoptError);
      else if (adopted) {
        const [, removeError] = attemptSync(() => storage?.removeItem("collection-ui"));
        if (removeError !== null) reportBackgroundError("collection.signal.adopt", removeError);
      }
    }
  }

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
