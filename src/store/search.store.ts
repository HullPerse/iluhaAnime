import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_HISTORY = 5;

interface SearchStore {
  history: string[];
  addQuery: (query: string) => void;
  removeQuery: (query: string) => void;
}

export const useSearchStore = create<SearchStore>()(
  persist(
    (set) => ({
      history: [],

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
