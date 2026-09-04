import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SEARCH_RANKING } from "@/config/searchRanking.config";
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

const MAX_LEARNING_ITEMS = SEARCH_RANKING.MAX_LEARNING_ITEMS;
const TTL_MS = SEARCH_RANKING.TTL_MS;

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

function purgeExpired(stats: Record<string, SearchQueryStat>): Record<string, SearchQueryStat> {
  const now = Date.now();
  let changed = false;
  const next: Record<string, SearchQueryStat> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (now - value.lastUsedAt > TTL_MS) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : stats;
}

function updateStat(
  stats: Record<string, SearchQueryStat>,
  value: string,
  selected = false,
  ignored = false
): Record<string, SearchQueryStat> {
  const key = normalize(value);
  if (!key) return stats;
  const purged = purgeExpired(stats);
  const current = purged[key];
  const next = {
    ...purged,
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
  invoke("upsert_unified_index", { entries })
    .then(() => {
      if (entries.length > 100) {
        invoke("optimize_unified_index").catch(() => {});
      }
      // also sync embeddings when semantic enabled (fire-and-forget, throttled)
      if (useSettingsStore.getState().searchSemanticEnabled) {
        // lazy: only first 50 to avoid 100s cold start
        const toEmbed = entries.slice(0, 50);
        for (const e of toEmbed) {
          invoke("upsert_embedding", { id: e.id, text: e.value }).catch(() => {});
        }
      }
    })
    .catch(() => {
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
      aliases: [romaji, favourite.title.english ?? ""].filter((alias) => alias && alias !== title),
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
          suggestionStats: updateStat(state.suggestionStats ?? {}, value, false, true),
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
      purgeExpired: () =>
        set((state) => ({
          queryStats: purgeExpired(state.queryStats ?? {}),
          suggestionStats: purgeExpired(state.suggestionStats ?? {}),
        })),
      clearScope: async (scope) => {
        try {
          await invoke("clear_unified_index_scope", { scope });
        } catch {
          // Fallback: prune scope with empty keep list on older backend
          await invoke("prune_unified_index_scope", {
            scope,
            keepIds: [],
          }).catch(() => {});
        }
      },
      clearAllLearning: async () => {
        set({ history: [], queryStats: {}, suggestionStats: {} });
        const scopes = ["global", "anilist", "torrent", "player", "filter"];
        for (const scope of scopes) {
          try {
            await invoke("clear_unified_index_scope", { scope });
          } catch {
            await invoke("prune_unified_index_scope", {
              scope,
              keepIds: [],
            }).catch(() => {});
          }
        }
      },
      resetFilters: () => set({ filters: { ...defaultFilters } }),
      setAnilistSearchQuery: (query) => set({ anilistSearchQuery: query }),
      setCrossSearchQuery: (query) => set({ crossSearchQuery: query }),
      setFilters: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),
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
