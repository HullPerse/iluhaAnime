import { collectionApi } from "@/api/collection.api";
import type { UnifiedIndexEntryInput } from "@/api/collection.api";
import { SEARCH_RANKING } from "@/config/search/ranking.config";
import { normalizeSearchText } from "@/lib/search/suggestions.utils";
import { createPersistedStoreContext } from "@/lib/state/persisted.utils";
import type { Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { settingsAtoms } from "@/store/settings.store";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist";
import type {
  SearchAnimeSuggestion,
  SearchFilters,
  SearchPersistedState,
  SearchQueryStat,
  SearchStore,
} from "@/types/search";

export const SEARCH_SCHEMA_VERSION = 3;

const MAX_LEARNING_ITEMS = SEARCH_RANKING.MAX_LEARNING_ITEMS;
const INDEX_BATCH_SIZE = 1000;
const TTL_MS = SEARCH_RANKING.TTL_MS;

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

// Module-wide chain: every syncUnifiedIndex call appends to the same queue,
// so overlapping syncs (search typing vs. AniList import vs. player scan)
// can no longer run concurrent `upsert_unified_index` commands against the
// single-writer SQLite file. A per-call chain (as before) serializes only
// batches within one call, which is exactly the race behind
// `upsert unified index: database is locked`.
let indexChain: Promise<unknown> = Promise.resolve();

function syncUnifiedIndex(entries: UnifiedIndexEntryInput[]): void {
  if (entries.length === 0) return;
  for (let offset = 0; offset < entries.length; offset += INDEX_BATCH_SIZE) {
    const batch = entries.slice(offset, offset + INDEX_BATCH_SIZE);
    indexChain = indexChain.then(() => collectionApi.upsertUnifiedIndex(batch));
  }
  if (entries.length > 100) {
    // Awaited (not fire-and-forget): FTS optimize holds a write transaction
    // that can outlast the 5 s busy timeout of anyone racing it.
    indexChain = indexChain.then(() =>
      collectionApi
        .optimizeUnifiedIndex()
        .catch((error) => reportBackgroundError("index.optimize", error))
    );
  }
  // Terminal catch keeps the shared chain resolved so one failed batch can
  // never skip the batches of a later call; failures are still reported.
  indexChain = indexChain.catch((error) => reportBackgroundError("index.upsert", error));
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

async function dropUnifiedScope(scope: string, label: string): Promise<void> {
  const [, error] = await attempt(collectionApi.clearUnifiedIndexScope(scope));
  if (error === null) return;
  const [, pruneError] = await attempt(collectionApi.pruneUnifiedIndexScope(scope, []));
  if (pruneError !== null) reportBackgroundError(label, pruneError);
}

export function migrateSearchState(persisted: unknown, version: number): SearchPersistedState {
  if (!persisted || typeof persisted !== "object") return persisted as SearchPersistedState;
  const rest = { ...(persisted as Record<string, unknown>) };
  if (version < 1) {
    delete rest.animeIndex;
    delete rest.animeProfileId;
  }
  if (version < 2 && !Array.isArray(rest.spellDictionary)) {
    rest.spellDictionary = [];
  }
  if (version < 3 && !Array.isArray(rest.filterPresets)) {
    rest.filterPresets = [];
  }
  return rest as SearchPersistedState;
}

const FILTER_PRESET_CAP = 20;
const FILTER_PRESET_NAME_MAX = 40;

type SearchActionKeys =
  | "addQuery"
  | "clearAnimeIndex"
  | "resetAnimeSuggestions"
  | "indexAniList"
  | "recordSuggestion"
  | "recordSuggestionIgnored"
  | "removeQuery"
  | "addSpellWord"
  | "removeSpellWord"
  | "purgeExpired"
  | "clearScope"
  | "clearAllLearning"
  | "saveFilterPreset"
  | "deleteFilterPreset"
  | "setAnilistSearchQuery"
  | "setCrossSearchQuery"
  | "setFilters"
  | "setSortBy"
  | "setSortDirection"
  | "resetFilters";

export type SearchData = Omit<SearchStore, SearchActionKeys>;
export type SearchAtoms = { [K in keyof SearchData]: Cell<SearchData[K]> };

const DEFAULT_SEARCH_DATA: SearchData = {
  history: [],
  queryStats: {},
  suggestionStats: {},
  spellDictionary: [],
  animeIndex: [],
  animeProfileId: null,
  crossSearchQuery: null,
  anilistSearchQuery: null,
  sortBy: "seeders",
  sortDirection: "desc",
  filters: { ...defaultFilters },
  filterPresets: [],
};

function buildAtoms(
  store: ReturnType<typeof createSignalStore>,
  data: SearchData
): SearchAtoms {
  const atoms = {} as SearchAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    sink[key] = store.atom(key, source[key]);
  }
  return atoms;
}

function readLegacySearch(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("searchState"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown; version?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  const version = typeof envelope.version === "number" ? envelope.version : 0;
  if (!state || typeof state !== "object") return null;
  const [migrated, migrateError] = attemptSync(() => migrateSearchState(state, version));
  if (migrateError !== null || !migrated || typeof migrated !== "object") return null;
  return { data: migrated as Record<string, unknown>, schemaVersion: SEARCH_SCHEMA_VERSION };
}

export interface SearchSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface SearchSignalStore {
  atoms: SearchAtoms;
  persistor: Persistor;
  addQuery: (query: string, scope?: string) => void;
  clearAnimeIndex: () => void;
  resetAnimeSuggestions: () => void;
  indexAniList: (
    lists: AniListCollection[],
    favourites: FavouriteAnime[],
    profileId: number | null
  ) => void;
  recordSuggestion: (value: string, scope?: string) => void;
  recordSuggestionIgnored: (value: string, scope?: string) => void;
  removeQuery: (query: string, scope?: string) => void;
  addSpellWord: (word: string) => void;
  removeSpellWord: (word: string) => void;
  purgeExpiredStats: () => void;
  clearScope: (scope: string) => Promise<void>;
  clearAllLearning: () => Promise<void>;
  saveFilterPreset: (name: string, filters: SearchFilters) => void;
  deleteFilterPreset: (name: string) => void;
  setAnilistSearchQuery: (query: string | null) => void;
  setCrossSearchQuery: (query: string | null) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  setSortBy: (sort: SearchData["sortBy"]) => void;
  setSortDirection: (dir: SearchData["sortDirection"]) => void;
  resetFilters: () => void;
  subscribeAll: (fn: () => void) => () => void;
}

export function createSearchSignalStore(options: SearchSignalOptions = {}): SearchSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "search",
    short: "search",
    schemaVersion: SEARCH_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacySearch(get),
  });

  const persisted = persistor.read();
  const persistedData = (persisted?.data ?? {}) as Partial<SearchData>;
  const data: SearchData = {
    ...DEFAULT_SEARCH_DATA,
    ...persistedData,
    filters: { ...defaultFilters, ...persistedData.filters },
  };
  const atoms = buildAtoms(store, data);

  store.subscribeAll(() => {
    persistor.write({
      filters: atoms.filters.get(),
      filterPresets: atoms.filterPresets.get(),
      history: atoms.history.get(),
      queryStats: atoms.queryStats.get(),
      sortBy: atoms.sortBy.get(),
      sortDirection: atoms.sortDirection.get(),
      spellDictionary: atoms.spellDictionary.get(),
      suggestionStats: atoms.suggestionStats.get(),
    });
  });

  const handle: SearchSignalStore = {
    atoms,
    persistor,
    subscribeAll: (fn) => store.subscribeAll(fn),
    addQuery: (query, scope = "global") => {
      if (settingsAtoms.autocompleteMode.get() === "off") return;
      const q = normalize(query);
      if (!q) return;
      const maxHistory = settingsAtoms.searchHistoryMaxItems.get();
      const history = atoms.history.get();
      const nextHistory = [q, ...history.filter((item) => item !== q)].slice(
        0,
        Math.max(0, maxHistory)
      );
      store.batch(() => {
        atoms.history.set(nextHistory);
        atoms.queryStats.set(updateStat(atoms.queryStats.get(), q));
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
    clearAnimeIndex: () => {
      atoms.animeIndex.set([]);
      atoms.animeProfileId.set(null);
    },
    resetAnimeSuggestions: () => {
      atoms.animeIndex.set([]);
      atoms.animeProfileId.set(null);
    },
    indexAniList: (lists, favourites, profileId) => {
      const animeIndex = buildAnimeIndex(lists, favourites);
      store.batch(() => {
        atoms.animeIndex.set(animeIndex);
        atoms.animeProfileId.set(profileId);
      });
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
    recordSuggestion: (value, scope = "global") => {
      if (settingsAtoms.autocompleteMode.get() === "off") return;
      atoms.suggestionStats.set(updateStat(atoms.suggestionStats.get(), value, true));
      collectionApi
        .recordUnifiedIndexAction("select", `history:${scope}:${normalize(value)}`)
        .catch((error) => reportBackgroundError("learning.select", error));
    },
    recordSuggestionIgnored: (value, scope = "global") => {
      if (settingsAtoms.autocompleteMode.get() === "off") return;
      atoms.suggestionStats.set(updateStat(atoms.suggestionStats.get(), value, false, true));
      collectionApi
        .recordUnifiedIndexAction("ignore", `history:${scope}:${normalize(value)}`)
        .catch((error) => reportBackgroundError("learning.ignore", error));
    },
    removeQuery: (query, scope = "global") => {
      const q = normalize(query);
      const history = atoms.history.get();
      atoms.history.set(history.filter((item) => item !== query && normalize(item) !== q));
      collectionApi
        .deleteUnifiedIndexEntry(`history:${scope}:${q}`)
        .catch((error) => reportBackgroundError("learning.remove", error));
    },
    addSpellWord: (word) => {
      const q = normalize(word);
      if (!q) return;
      const spellDictionary = atoms.spellDictionary.get();
      atoms.spellDictionary.set(
        spellDictionary.includes(q) ? spellDictionary : [...spellDictionary, q]
      );
    },
    removeSpellWord: (word) => {
      const q = normalize(word);
      atoms.spellDictionary.set(atoms.spellDictionary.get().filter((item) => item !== q));
    },
    purgeExpiredStats: () => {
      atoms.queryStats.set(purgeExpired(atoms.queryStats.get()));
      atoms.suggestionStats.set(purgeExpired(atoms.suggestionStats.get()));
    },
    clearScope: (scope) => dropUnifiedScope(scope, "scope.prune"),
    clearAllLearning: async () => {
      atoms.history.set([]);
      atoms.queryStats.set({});
      atoms.suggestionStats.set({});
      const scopes = ["global", "anilist", "torrent", "player", "filter"];
      for (const scope of scopes) await dropUnifiedScope(scope, "learning.prune");
    },
    saveFilterPreset: (name, filters) => {
      const trimmed = name.trim().slice(0, FILTER_PRESET_NAME_MAX);
      if (!trimmed) return;
      const filterPresets = atoms.filterPresets.get();
      atoms.filterPresets.set(
        [
          { name: trimmed, filters: { ...filters } },
          ...filterPresets.filter((preset) => preset.name !== trimmed),
        ].slice(0, FILTER_PRESET_CAP)
      );
    },
    deleteFilterPreset: (name) => {
      atoms.filterPresets.set(atoms.filterPresets.get().filter((preset) => preset.name !== name));
    },
    setAnilistSearchQuery: (query) => atoms.anilistSearchQuery.set(query),
    setCrossSearchQuery: (query) => atoms.crossSearchQuery.set(query),
    setFilters: (partial) => atoms.filters.set({ ...atoms.filters.get(), ...partial }),
    setSortBy: (sort) => atoms.sortBy.set(sort),
    setSortDirection: (dir) => atoms.sortDirection.set(dir),
    resetFilters: () => atoms.filters.set({ ...defaultFilters }),
  };

  finishAdopt(undefined, { remove: "searchState" });

  return handle;
}

const search = createSearchSignalStore();

export const searchAtoms = search.atoms;
export const searchPersistor = search.persistor;
export const addSearchQuery = search.addQuery;
export const clearSearchAnimeIndex = search.clearAnimeIndex;
export const resetAnimeSuggestions = search.resetAnimeSuggestions;
export const indexSearchAniList = search.indexAniList;
export const recordSearchSuggestion = search.recordSuggestion;
export const recordSearchSuggestionIgnored = search.recordSuggestionIgnored;
export const removeSearchQuery = search.removeQuery;
export const addSpellWord = search.addSpellWord;
export const removeSpellWord = search.removeSpellWord;
export const purgeSearchStats = search.purgeExpiredStats;
export const clearSearchScope = search.clearScope;
export const clearAllSearchLearning = search.clearAllLearning;
export const saveSearchFilterPreset = search.saveFilterPreset;
export const deleteSearchFilterPreset = search.deleteFilterPreset;
export const setAnilistSearchQuery = search.setAnilistSearchQuery;
export const setCrossSearchQuery = search.setCrossSearchQuery;
export const setSearchFilters = search.setFilters;
export const setSearchSortBy = search.setSortBy;
export const setSearchSortDirection = search.setSortDirection;
export const resetSearchFilters = search.resetFilters;
export function subscribeSearch(listener: () => void): () => void {
  return search.subscribeAll(listener);
}

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => search.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") search.persistor.flush();
  });
}
