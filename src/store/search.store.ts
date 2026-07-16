import type { SearchFilters, SearchStore } from "@/types/search";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSettingsStore } from "@/store/settings.store";

 const defaultFilters: SearchFilters = {
  minSeeders: 0,
  hasMagnet: false,
  quality: "all",
  language: "all",
  sizeMin: 0,
  sizeMax: 0,
  codec: "all",
};

export const useSearchStore = create<SearchStore>()(
  persist(
    (set) => ({
      history: [],
      crossSearchQuery: null,
      sortBy: "seeders" as const,
      sortDirection: "desc" as const,
      filters: { ...defaultFilters },

      setCrossSearchQuery: (query) => set({ crossSearchQuery: query }),
      addQuery: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return;
        const maxHistory = useSettingsStore.getState().searchHistoryMaxItems;
        set((s) => {
          const filtered = s.history.filter((h) => h !== q);
          filtered.unshift(q);
          return { history: filtered.slice(0, maxHistory) };
        });
      },

      removeQuery: (query) =>
        set((s) => ({
          history: s.history.filter((h) => h !== query),
        })),

      setSortBy: (sort) => set({ sortBy: sort }),

      setSortDirection: (dir) => set({ sortDirection: dir }),

      setFilters: (partial) =>
        set((s) => ({ filters: { ...s.filters, ...partial } })),

      resetFilters: () => set({ filters: { ...defaultFilters } }),
    }),
    { name: "searchState" },
  ),
);
