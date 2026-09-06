import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_FILTERS } from "@/config/collection/filters.config";
import type {
  CollectionFilters,
  CollectionStatus,
  CollectionStore,
  WizardPrefill,
} from "@/types/collection";

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
    coverDithered: false,
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
    coverDithered: Boolean(state.coverDithered),
    viewMode: (state.viewMode as CollectionStore["viewMode"]) ?? "grid",
    displayMode: state.displayMode === "scroll" ? "scroll" : "pagination",
  } as CollectionStore;
}

export const useCollectionStore = create<CollectionStore>()(
  persist(
    (set) => ({
      selectedStatus: "all",
      searchQuery: "",
      sortBy: "date",
      sortDir: "desc",
      filters: { ...DEFAULT_FILTERS },
      groupByStatus: false,
      collapsedStatuses: new Set<string>(),
      coverDithered: false,
      viewMode: "grid",
      displayMode: "pagination",
      wizardPrefill: null,

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSelectedStatus: (selectedStatus) => set({ selectedStatus }),
      setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setGroupByStatus: (groupByStatus) => set({ groupByStatus }),
      toggleStatusCollapsed: (statusId: CollectionStatus) =>
        set((s) => {
          const next = new Set(s.collapsedStatuses);
          if (next.has(statusId)) next.delete(statusId);
          else next.add(statusId);
          return { collapsedStatuses: next };
        }),
      setCoverDithered: (coverDithered) => set({ coverDithered }),
      setViewMode: (viewMode) => set({ viewMode }),
      setDisplayMode: (displayMode) => set({ displayMode }),
      requestWizardPrefill: (prefill: WizardPrefill) => set({ wizardPrefill: prefill }),
      consumeWizardPrefill: () => set({ wizardPrefill: null }),
    }),
    {
      name: "collection-ui",
      version: 9,
      migrate: (persistedState: unknown, version: number) => {
        if (!isRecord(persistedState)) return {} as Partial<CollectionStore>;
        const state = persistedState as Partial<CollectionStore> & {
          collapsedStatuses?: unknown;
        };
        if (version < 4) return migrateFromLegacy(state);
        return migrateCurrent(state, version);
      },
      partialize: (state) => ({
        selectedStatus: state.selectedStatus,
        searchQuery: state.searchQuery,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        filters: state.filters,
        groupByStatus: state.groupByStatus,
        collapsedStatuses: Array.from(state.collapsedStatuses) as unknown as Set<string>,
        coverDithered: state.coverDithered,
        viewMode: state.viewMode,
        displayMode: state.displayMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.collapsedStatuses = toSet(state.collapsedStatuses);
        }
      },
    }
  )
);
