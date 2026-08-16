import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createDebouncedStorage } from "@/lib/debounced.storage";
import { normalizeSearchText } from "@/lib/search.suggestions";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist";
import type {
  SearchAnimeSuggestion,
  SearchFilters,
  SearchQueryStat,
  SearchStore,
} from "@/types/search";

const MAX_LEARNING_ITEMS = 2_000;

type SearchPersistedState = Pick<
  SearchStore,
  | "animeIndex"
  | "animeProfileId"
  | "filters"
  | "history"
  | "queryStats"
  | "sortBy"
  | "sortDirection"
  | "suggestionStats"
>;

const defaultFilters: SearchFilters = {
  codec: "all",
  hasMagnet: false,
  language: "all",
  minSeeders: 0,
  quality: "all",
  sizeMax: 0,
  sizeMin: 0,
};

function normalize(value: string): string {
  return normalizeSearchText(value);
}

function updateStat(
  stats: Record<string, SearchQueryStat>,
  value: string,
  selected = false,
  ignored = false
): Record<string, SearchQueryStat> {
  const key = normalize(value);
  if (!key) return stats;
  const current = stats[key];
  const next = {
    ...stats,
    [key]: {
      count: (current?.count ?? 0) + (selected || ignored ? 0 : 1),
      lastIgnoredAt: ignored ? Date.now() : current?.lastIgnoredAt,
      lastUsedAt: Date.now(),
      selectedCount: (current?.selectedCount ?? 0) + (selected ? 1 : 0),
      ignoredCount: (current?.ignoredCount ?? 0) + (ignored ? 1 : 0),
    },
  };
  const keys = Object.keys(next);
  if (keys.length <= MAX_LEARNING_ITEMS) return next;
  keys
    .sort((a, b) => (next[a].lastUsedAt ?? 0) - (next[b].lastUsedAt ?? 0))
    .slice(0, keys.length - MAX_LEARNING_ITEMS)
    .forEach((keyToRemove) => delete next[keyToRemove]);
  return next;
}

function syncUnifiedIndex(
  entries: Array<{
    id: string;
    kind: string;
    scope: string;
    value: string;
    subtitle?: string;
    metadata?: unknown;
  }>
): void {
  if (entries.length === 0) return;
  invoke("upsert_unified_index", { entries }).catch(() => {
    // Browser preview and older installations may not expose the backend index yet.
  });
}

function buildAnimeIndex(
  lists: AniListCollection[],
  favourites: FavouriteAnime[]
): SearchAnimeSuggestion[] {
  const favouriteIds = new Set(favourites.map((item) => item.id));
  const entries = new Map<number, SearchAnimeSuggestion>();

  for (const list of lists) {
    for (const entry of list.entries) {
      const media = entry.media;
      entries.set(media.id, {
        aliases: media.titles.filter((title) => title !== media.title),
        favourite: favouriteIds.has(media.id),
        id: media.id,
        score: entry.score,
        season: media.season,
        seasonYear: media.season_year,
        status: entry.list_status,
        title: media.title,
      });
    }
  }

  for (const favourite of favourites) {
    if (entries.has(favourite.id)) continue;
    const romaji = favourite.title.romaji;
    const title = favourite.title.english ?? romaji;
    entries.set(favourite.id, {
      aliases: [romaji, favourite.title.english ?? ""].filter(
        (alias) => alias && alias !== title
      ),
      favourite: true,
      id: favourite.id,
      score: favourite.mean_score,
      season: null,
      seasonYear: null,
      status: "FAVOURITE",
      title,
    });
  }

  return [...entries.values()].slice(0, MAX_LEARNING_ITEMS);
}

export const useSearchStore = create<SearchStore>()(
  persist(
    (set) => ({
      addQuery: (query, scope = "global") => {
        if (useSettingsStore.getState().autocompleteMode === "off") return;
        const q = normalize(query);
        if (!q) return;
        const maxHistory = useSettingsStore.getState().searchHistoryMaxItems;
        set((state) => {
          const history = [q, ...state.history.filter((item) => item !== q)].slice(
            0,
            Math.max(0, maxHistory)
          );
          return {
            history,
            queryStats: updateStat(state.queryStats ?? {}, q),
          };
        });
        syncUnifiedIndex([
          {
            id: `history:${scope}:${q}`,
            kind: "history",
            scope,
            value: q,
            metadata: { scope },
          },
        ]);
      },
      anilistSearchQuery: null,
      animeIndex: [],
      animeProfileId: null,
      clearAnimeIndex: () => set({ animeIndex: [], animeProfileId: null }),
      resetAnimeSuggestions: () => set({ animeIndex: [], animeProfileId: null }),
      crossSearchQuery: null,
      filters: { ...defaultFilters },
      history: [],
      indexAniList: (lists, favourites, profileId) => {
        const animeIndex = buildAnimeIndex(lists, favourites);
        set({ animeIndex, animeProfileId: profileId });
        syncUnifiedIndex(
          animeIndex.flatMap((anime) => [
            {
              id: `anime:${anime.id}`,
              kind: "anime",
              scope: "anilist",
              value: anime.title,
              subtitle: anime.status,
              metadata: {
                aliases: anime.aliases,
                favourite: anime.favourite,
                profileId,
                score: anime.score,
                season: anime.season,
                seasonYear: anime.seasonYear,
              },
            },
            ...anime.aliases.map((alias) => ({
              id: `anime:${anime.id}:alias:${normalize(alias)}`,
              kind: "anime_alias",
              scope: "anilist",
              value: alias,
              subtitle: anime.title,
              metadata: { animeId: anime.id, profileId },
            })),
          ])
        );
      },
      queryStats: {},
      recordSuggestion: (value) => {
        if (useSettingsStore.getState().autocompleteMode === "off") return;
        set((state) => ({
          suggestionStats: updateStat(state.suggestionStats ?? {}, value, true),
        }));
        invoke("record_unified_index_action", {
          action: "select",
          id: `history:global:${normalize(value)}`,
        }).catch(() => {});
      },
      recordSuggestionIgnored: (value) => {
        if (useSettingsStore.getState().autocompleteMode === "off") return;
        set((state) => ({
          suggestionStats: updateStat(
            state.suggestionStats ?? {},
            value,
            false,
            true
          ),
        }));
        invoke("record_unified_index_action", {
          action: "ignore",
          id: `history:global:${normalize(value)}`,
        }).catch(() => {});
      },
      removeQuery: (query) =>
        set((state) => ({
          history: state.history.filter((item) => item !== query),
        })),
      resetFilters: () => set({ filters: { ...defaultFilters } }),
      setAnilistSearchQuery: (query) => set({ anilistSearchQuery: query }),
      setCrossSearchQuery: (query) => set({ crossSearchQuery: query }),
      setFilters: (partial) =>
        set((state) => ({ filters: { ...state.filters, ...partial } })),
      setSortBy: (sort) => set({ sortBy: sort }),
      setSortDirection: (dir) => set({ sortDirection: dir }),
      sortBy: "seeders" as const,
      sortDirection: "desc" as const,
      suggestionStats: {},
    }),
    {
      name: "searchState",
      storage: createDebouncedStorage<SearchPersistedState>(() => localStorage),
      partialize: (state): SearchPersistedState => ({
        animeIndex: state.animeIndex,
        animeProfileId: state.animeProfileId,
        filters: state.filters,
        history: state.history,
        queryStats: state.queryStats,
        sortBy: state.sortBy,
        sortDirection: state.sortDirection,
        suggestionStats: state.suggestionStats,
      }),
    }
  )
);
