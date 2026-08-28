import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_FILTERS } from "@/lib/collection.filters";
import type {
  CollectionFilters,
  CollectionStatus,
  CollectionStore,
} from "@/types/collection";

function toSet(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value as string[]);
  if (value instanceof Set) return value;
  return new Set<string>();
}

export const useCollectionStore = create<CollectionStore>()(
  persist(
    (set) => ({
      selectedStatus: "all",
      searchQuery: "",
      sortBy: "date",
      sortDir: "desc",
      filters: { ...DEFAULT_FILTERS },
      activeSection: "library",
      // Group-by-status view: when on, the library renders one collapsible
      // section per status (like player categories) instead of a flat grid.
      groupByStatus: false,
      collapsedStatuses: new Set<string>(),

      setActiveSection: (activeSection) => set({ activeSection }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSelectedStatus: (selectedStatus) => set({ selectedStatus }),
      setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),
      setFilters: (patch) =>
        set((s) => ({ filters: { ...s.filters, ...patch } })),
      setGroupByStatus: (groupByStatus) => set({ groupByStatus }),
      toggleStatusCollapsed: (statusId: CollectionStatus) =>
        set((s) => {
          const next = new Set(s.collapsedStatuses);
          if (next.has(statusId)) next.delete(statusId);
          else next.add(statusId);
          return { collapsedStatuses: next };
        }),
    }),
    {
      name: "collection-ui",
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== "object")
          return {} as Partial<CollectionStore>;
        const state = persistedState as Partial<CollectionStore> & {
          collapsedStatuses?: unknown;
        };
        // v<4 used "collection" key with full data; drop data, keep only UI fields.
        if (version < 4) {
          return {
            selectedStatus: state.selectedStatus ?? "all",
            searchQuery: state.searchQuery ?? "",
            sortBy: state.sortBy ?? "date",
            sortDir: state.sortDir ?? "desc",
            filters: (state.filters as CollectionFilters | undefined) ?? {
              ...DEFAULT_FILTERS,
            },
            activeSection:
              state.activeSection === "statistics"
                ? "statistics"
                : "library",
            groupByStatus: false,
            collapsedStatuses: toSet(state.collapsedStatuses),
          };
        }
        return {
          selectedStatus: state.selectedStatus ?? "all",
          searchQuery: state.searchQuery ?? "",
          sortBy: state.sortBy ?? "date",
          sortDir: state.sortDir ?? "desc",
          filters: (state.filters as CollectionFilters | undefined) ?? {
            ...DEFAULT_FILTERS,
          },
          activeSection:
            state.activeSection === "statistics" ? "statistics" : "library",
          groupByStatus: Boolean(state.groupByStatus),
          collapsedStatuses: toSet(state.collapsedStatuses),
        } as CollectionStore;
      },
      partialize: (state) => ({
        selectedStatus: state.selectedStatus,
        searchQuery: state.searchQuery,
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        filters: state.filters,
        activeSection: state.activeSection,
        groupByStatus: state.groupByStatus,
        collapsedStatuses: Array.from(
          state.collapsedStatuses
        ) as unknown as Set<string>,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.collapsedStatuses = toSet(state.collapsedStatuses);
        }
      },
    }
  )
);
