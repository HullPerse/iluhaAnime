import { collectionApi } from "@/api/collection.api";
import type { UnifiedIndexEntryInput } from "@/api/collection.api";
import {
  applyLearningAction,
  buildLearningMaps,
  dropLearningScope,
  learningStatKey,
} from "@/lib/ranking/learning.utils";
import { RANKING } from "@/lib/ranking/ranking.config";
import { normalizeSearchText } from "@/lib/search/suggestions.utils";
import { buildTypedTitles } from "@/lib/search/title.utils";
import type { Persistor } from "@/lib/state/persist.utils";
import { createPersistedStoreContext } from "@/lib/state/persisted.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist";
import type {
  CorrectionReason,
  SearchAnimeSuggestion,
  SearchFilters,
  SearchPersistedState,
  SearchStore,
} from "@/types/search";

export const SEARCH_SCHEMA_VERSION = 4;

const MAX_LEARNING_ITEMS = RANKING.MAX_LEARNING_ITEMS;
const INDEX_BATCH_SIZE = 1000;

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

function historyEntryId(scope: string, normalized: string): string {
  return `history:${scope}:${normalized}`;
}

let indexChain: Promise<unknown> = Promise.resolve();

const ANIME_SYNC_KEY_STORAGE = "animeIndexSyncKey";

function readStoredSyncKey(): string | null {
  const [value] = attemptSync(() => localStorage.getItem(ANIME_SYNC_KEY_STORAGE));
  return typeof value === "string" && value.length > 0 ? value : null;
}

function writeStoredSyncKey(key: string | null): void {
  attemptSync(() => {
    if (key === null) localStorage.removeItem(ANIME_SYNC_KEY_STORAGE);
    else localStorage.setItem(ANIME_SYNC_KEY_STORAGE, key);
  });
}

function animeIndexSyncKey(animeIndex: SearchAnimeSuggestion[], profileId: number | null): string {
  let hash = 0;
  const mix = (text: string): void => {
    for (const char of text) hash = Math.trunc(Math.imul(hash, 31) + (char.codePointAt(0) ?? 0));
  };
  mix(`profile:${profileId ?? 0}|n:${animeIndex.length}`);
  for (const anime of animeIndex) {
    mix(
      `#${anime.id}|${anime.title}|${anime.status}|${anime.score ?? 0}|${anime.favourite ? 1 : 0}`
    );
    for (const alias of anime.aliases) mix(`@${alias}`);
    for (const typed of anime.typedTitles ?? []) mix(`:${typed.kind}=${typed.title}`);
  }
  return `${animeIndex.length}:${hash}`;
}

export function invalidateAnimeIndexSync(): void {
  writeStoredSyncKey(null);
}

function syncUnifiedIndex(entries: UnifiedIndexEntryInput[]): Promise<boolean> {
  if (entries.length === 0) return Promise.resolve(true);
  const run = indexChain
    .then(async () => {
      for (let offset = 0; offset < entries.length; offset += INDEX_BATCH_SIZE) {
        const batch = entries.slice(offset, offset + INDEX_BATCH_SIZE);
        await collectionApi.upsertUnifiedIndex(batch);
      }
      if (entries.length > 100) await collectionApi.optimizeUnifiedIndex();
      return true;
    })
    .catch((error: unknown) => {
      reportBackgroundError("index.upsert", error);
      return false;
    });
  indexChain = run;
  return run;
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
        typedTitles: buildTypedTitles(media.id, {
          title: media.title,
          title_english: media.title_english,
          title_native: media.title_native,
          title_romaji: media.title_romaji,
          titles: media.titles,
        }),
      });
    }
  }

  for (const favourite of favourites) {
    if (entries.has(favourite.id)) continue;
    const romaji = favourite.title.romaji;
    const english = favourite.title.english;
    const title = english ?? romaji;
    entries.set(favourite.id, {
      aliases: [romaji, english ?? ""].filter((alias) => alias && alias !== title),
      favourite: true,
      id: favourite.id,
      score: favourite.mean_score,
      season: null,
      seasonYear: null,
      status: "FAVOURITE",
      title,
      typedTitles: buildTypedTitles(favourite.id, {
        title,
        title_english: english,
        title_romaji: romaji,
        titles: [romaji, favourite.title.english ?? ""],
      }),
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
  if (version < 4) {
    // Learning counters now live in SQLite (`unified_index`); local copies are
    // a projection rebuilt at startup and must not be persisted again.
    delete rest.queryStats;
    delete rest.suggestionStats;
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
  | "setResultSource"
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
  resultSource: null,
  sortBy: "seeders",
  sortDirection: "desc",
  filters: { ...defaultFilters },
  filterPresets: [],
};

function buildAtoms(store: ReturnType<typeof createSignalStore>, data: SearchData): SearchAtoms {
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
  recordSuggestion: (value: string, scope?: string, reason?: CorrectionReason) => void;
  recordSuggestionIgnored: (value: string, scope?: string) => void;
  removeQuery: (query: string, scope?: string) => void;
  addSpellWord: (word: string) => void;
  removeSpellWord: (word: string) => void;
  purgeExpiredStats: () => void;
  clearScope: (scope: string) => Promise<void>;
  clearAllLearning: () => Promise<void>;
  hydrateLearning: () => Promise<void>;
  saveFilterPreset: (name: string, filters: SearchFilters) => void;
  deleteFilterPreset: (name: string) => void;
  setAnilistSearchQuery: (query: string | null) => void;
  setCrossSearchQuery: (query: string | null) => void;
  setResultSource: (source: SearchStore["resultSource"]) => void;
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
      sortBy: atoms.sortBy.get(),
      sortDirection: atoms.sortDirection.get(),
      spellDictionary: atoms.spellDictionary.get(),
    });
  });

  const hydrateLearning = async (): Promise<void> => {
    const [rows, error] = await attempt(collectionApi.listLearningStats(RANKING.TTL_DAYS));
    if (error) {
      reportBackgroundError("learning.hydrate", error);
      return;
    }
    const maps = buildLearningMaps(Array.isArray(rows) ? rows : []);
    store.batch(() => {
      atoms.queryStats.set(maps.queryStats);
      atoms.suggestionStats.set(maps.suggestionStats);
    });
  };

  const handle: SearchSignalStore = {
    atoms,
    persistor,
    hydrateLearning,
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
        atoms.queryStats.set(
          applyLearningAction(atoms.queryStats.get(), learningStatKey(scope, q), "use")
        );
      });
      syncUnifiedIndex([
        {
          id: historyEntryId(scope, q),
          kind: "history",
          scope,
          value: q,
          metadata: { scope },
          bumpUse: true,
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
      invalidateAnimeIndexSync();
      dropUnifiedScope("anilist", "scope.prune").catch((error) =>
        reportBackgroundError("scope.prune", error)
      );
    },
    indexAniList: (lists, favourites, profileId) => {
      const animeIndex = buildAnimeIndex(lists, favourites);
      store.batch(() => {
        atoms.animeIndex.set(animeIndex);
        atoms.animeProfileId.set(profileId);
      });
      const syncKey = animeIndexSyncKey(animeIndex, profileId);
      if (syncKey !== readStoredSyncKey()) {
        const entries = animeIndex.flatMap((anime) => [
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
        ]);
        // Only remember the fingerprint once the write actually landed, so a
        // locked database retries on the next launch instead of staying stale.
        syncUnifiedIndex(entries)
          .then((written) => {
            if (written) writeStoredSyncKey(syncKey);
          })
          .catch((error) => reportBackgroundError("index.sync", error));
      }
    },
    recordSuggestion: (value, scope = "global", reason?: CorrectionReason) => {
      if (settingsAtoms.autocompleteMode.get() === "off") return;
      const q = normalize(value);
      if (!q) return;
      const now = Date.now();
      store.batch(() => {
        atoms.suggestionStats.set(
          applyLearningAction(atoms.suggestionStats.get(), q, "select", now, reason)
        );
        if (atoms.history.get().some((entry) => normalize(entry) === q)) {
          atoms.queryStats.set(
            applyLearningAction(
              atoms.queryStats.get(),
              learningStatKey(scope, q),
              "select",
              now,
              reason
            )
          );
        }
      });
      collectionApi
        .recordUnifiedIndexValueAction("select", value, scope)
        .catch((error) => reportBackgroundError("learning.select", error));
    },
    recordSuggestionIgnored: (value, scope = "global") => {
      if (settingsAtoms.autocompleteMode.get() === "off") return;
      const q = normalize(value);
      if (!q) return;
      const now = Date.now();
      store.batch(() => {
        atoms.suggestionStats.set(
          applyLearningAction(atoms.suggestionStats.get(), q, "ignore", now)
        );
        if (atoms.history.get().some((entry) => normalize(entry) === q)) {
          atoms.queryStats.set(
            applyLearningAction(atoms.queryStats.get(), learningStatKey(scope, q), "ignore", now)
          );
        }
      });
      collectionApi
        .recordUnifiedIndexValueAction("ignore", value, scope)
        .catch((error) => reportBackgroundError("learning.ignore", error));
    },
    removeQuery: (query, scope = "global") => {
      const q = normalize(query);
      const history = atoms.history.get();
      atoms.history.set(history.filter((item) => item !== query && normalize(item) !== q));
      const key = learningStatKey(scope, q);
      if (key in atoms.queryStats.get()) {
        const next = { ...atoms.queryStats.get() };
        delete next[key];
        atoms.queryStats.set(next);
      }
      collectionApi
        .deleteUnifiedIndexEntry(historyEntryId(scope, q))
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
      hydrateLearning().catch((error) => reportBackgroundError("learning.purge", error));
    },
    clearScope: (scope) => {
      if (scope === "anilist") invalidateAnimeIndexSync();
      atoms.queryStats.set(dropLearningScope(atoms.queryStats.get(), scope));
      return dropUnifiedScope(scope, "scope.prune");
    },
    clearAllLearning: async () => {
      atoms.history.set([]);
      atoms.queryStats.set({});
      atoms.suggestionStats.set({});
      invalidateAnimeIndexSync();
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
    setResultSource: (source) => atoms.resultSource.set(source),
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
export const hydrateSearchLearning = search.hydrateLearning;
export const clearSearchScope = search.clearScope;
export const clearAllSearchLearning = search.clearAllLearning;
export const saveSearchFilterPreset = search.saveFilterPreset;
export const deleteSearchFilterPreset = search.deleteFilterPreset;
export const setAnilistSearchQuery = search.setAnilistSearchQuery;
export const setCrossSearchQuery = search.setCrossSearchQuery;
export const setResultSource = search.setResultSource;
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
