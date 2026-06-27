import { SearchStore } from "@/types/search";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_HISTORY = 5;

export const useSearchStore = create<SearchStore>()(
  persist(
    (set) => ({
      history: [],
      crossSearchQuery: null,

      setCrossSearchQuery: (query) => set({ crossSearchQuery: query }),
      addQuery: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return;
        set((s) => {
          const filtered = s.history.filter((h) => h !== q);
          filtered.unshift(q);
          return { history: filtered.slice(0, MAX_HISTORY) };
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
