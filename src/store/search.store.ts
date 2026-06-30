import { SearchStore } from "@/types/search";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSettingsStore } from "@/store/settings.store";

export const useSearchStore = create<SearchStore>()(
  persist(
    (set) => ({
      history: [],
      crossSearchQuery: null,

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
    }),
    { name: "searchState" },
  ),
);
