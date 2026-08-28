import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Filter, Search, User, SearchX } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import { seasonLabels } from "@/config/anilist.config";
import { usePagination } from "@/hooks/pagination.hook";
import { useSugggestions } from "@/hooks/suggestion.hook";
import {
  filterEntries,
  sortEntries,
  buildEntryLookup,
  searchFiltersToParams,
  sortAniMediaList,
} from "@/lib/anilist.utils";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
import { paginate } from "@/lib/pagination.utils";
import {
  getInlineCompletion,
  getSearchSuggestions,
  type SearchSuggestion,
} from "@/lib/search.suggestions";
import { useAniListFriendsStore } from "@/store/anilist.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniFriend,
  AniListAnime,
  AniListCollection,
  AniListFilters,
  AniListSort,
  AniMedia,
  AniRecommendation,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
  GlobalSort,
  SearchMode,
  AnilistRouteData,
} from "@/types/anilist";

import ActivityHistoryModal from "./components/anilist/activity.anilist";
import Auth from "./components/anilist/auth.anilist";
import BrowseAnimeModal from "./components/anilist/browse.anilist";
import AniListEntryCard from "./components/anilist/card.anilist";
import Details from "./components/anilist/details.anilist";
import AniListFavouritesModal from "./components/anilist/favourites.anilist";
import FiltersModal, {
  defaultFilters,
} from "./components/anilist/filters.anilist";
import AniListFriendsModal from "./components/anilist/friends.anilist";
import AniListProfileHeader from "./components/anilist/header.anilist";
import AniListTabs from "./components/anilist/list.anilist";
import PrefetchRelationsModal from "./components/anilist/prefetch.anilist";
import AniListRecsModal from "./components/anilist/rec.anilist";
import AniListSortBar from "./components/anilist/sort.anilist";
import StatsModal from "./components/anilist/stats.anilist";

function AnilistRoute() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const setAnilistSearchQuery = useSearchStore(
    (state) => state.setAnilistSearchQuery
  );
  const indexAniList = useSearchStore((state) => state.indexAniList);
  const animeIndex = useSearchStore((state) => state.animeIndex);
  const animeProfileId = useSearchStore((state) => state.animeProfileId);
  const searchHistory = useSearchStore((state) => state.history);
  const queryStats = useSearchStore((state) => state.queryStats);
  const suggestionStats = useSearchStore((state) => state.suggestionStats);
  const addQuery = useSearchStore((state) => state.addQuery);
  const recordSuggestion = useSearchStore((state) => state.recordSuggestion);
  const recordSuggestionIgnored = useSearchStore(
    (state) => state.recordSuggestionIgnored
  );

  const [searchTerms, setSearchTerms] = useState<string>("");
  const [currentList, setCurrentList] = useState<string>("");
  const [auth, setAuth] = useState<boolean>(false);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime>(null);
  const [animeHistory, setAnimeHistory] = useState<AniListAnime[]>([]);
  const [showRecs, setShowRecs] = useState(false);
  const [recs, setRecs] = useState<AniRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [showFavourites, setShowFavourites] = useState(false);
  const [activityHistory, setActivityHistory] = useState<{
    open: boolean;
    tab: "feed" | "calendar";
  }>({ open: false, tab: "feed" });
  const [showBrowse, setShowBrowse] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPrefetch, setShowPrefetch] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchFilters, setSearchFilters] =
    useState<AniListFilters>(defaultFilters);

  const { data, isLoading } = useQuery<AnilistRouteData>({
    queryKey: ["anilist_data"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const user = await invoke<AniUser | null>("check_anilist_auth");
      if (!user) return { user: null, lists: [], favourites: [] };
      const [lists, favourites] = await Promise.all([
        invoke<AniListCollection[]>("get_anilist_lists", { userId: user.id }),
        invoke<FavouriteAnime[]>("get_favourites", { userId: user.id }),
      ]);
      return { user, lists, favourites };
    },
  });

  const user = data?.user ?? null;
  const lists = data?.lists ?? [];
  const favourites = data?.favourites ?? [];

  useEffect(() => {
    if (user) indexAniList(lists, favourites, user.id);
  }, [favourites, indexAniList, lists, user]);

  useEffect(() => {
    if (!user) return;
    invoke("sync_franchise_to_index").catch(() => {});
  }, [user]);

  const friends = useAniListFriendsStore((state) => state.friends);
  const addFriend = useAniListFriendsStore((state) => state.addFriend);
  const cacheFriendProfile = useAniListFriendsStore(
    (state) => state.cacheProfile
  );
  const removeFriend = useAniListFriendsStore((state) => state.removeFriend);
  const friendIds = useMemo(
    () => [...new Set(friends.map((friend) => friend.id))],
    [friends]
  );

  const favouriteIds = useMemo(
    () => new Set(favourites.map((f) => f.id)),
    [favourites]
  );

  const allAnimeIds = useMemo(
    () => lists.flatMap((l) => l.entries.map((e) => e.media.id)),
    [lists]
  );

  useEffect(() => {
    if (!showRecs || !user) return;
    setRecsLoading(true);
    invoke<AniRecommendation[]>("get_profile_recommendations", {
      userId: user.id,
    })
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
  }, [showRecs, user]);

  const [global, setGlobal] = useState<boolean>(false);
  const [sort, setSort] = useState<AniListSort>({ key: "title", dir: "asc" });
  const [searchResults, setSearchResults] = useState<AniMedia[]>([]);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(null);
  const [globalSort, setGlobalSort] = useState<GlobalSort>({
    key: "relevance",
    dir: "desc",
  });
  const [page, setPage] = useState<number>(1);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const anilistPageSize = useSettingsStore((s) => s.anilistPageSize);
  const anilistSuggestionBoost = useSettingsStore(
    (s) => s.anilistSuggestionBoost
  );
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (lists.length === 0) return;
    setCurrentList((prev) => {
      if (prev) return prev;
      const first = lists.find((c) => c.entries.length > 0);
      return first?.name ?? "";
    });
  }, [lists]);

  const handleGlobal = useCallback(async () => {
    const query = searchTerms.trim();
    if (query) addQuery(query, "anilist");
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    try {
      const params = searchFiltersToParams(
        searchFilters,
        searchTerms.trim() || null,
        anilistPageSize,
        useSettingsStore.getState().anilistMaxPages
      );
      const res = await invoke<AniMedia[]>("search_anilist", params);
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  }, [addQuery, searchTerms]);

  const handleSeason = useCallback(
    async (season: string, seasonYear: number | null) => {
      setGlobal(true);
      setLoadingSearch(true);
      setSearchResults([]);
      setSearchTerms("");
      setSearchTag(
        `${t((seasonLabels[season] ?? season) as never)}${seasonYear ? ` ${seasonYear}` : ""}`
      );
      setSearchMode("season");
      try {
        const res = await invoke<AniMedia[]>("search_anilist", {
          query: null,
          tags: null,
          genres: null,
          format: null,
          status: null,
          season: season || null,
          seasonYear,
          adult: null,
          sort: null,
          source: null,
          country: null,
          yearFrom: null,
          yearTo: null,
          episodesFrom: null,
          episodesTo: null,
          scoreFrom: null,
          scoreTo: null,
          maxPages: useSettingsStore.getState().anilistMaxPages,
          perPage: anilistPageSize,
        });
        setSearchResults(res);
      } finally {
        setLoadingSearch(false);
      }
    },
    [t]
  );

  const handleStudio = useCallback(async (id: number, name: string) => {
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    setSearchTerms("");
    setSearchTag(name);
    setSearchMode("studio");
    try {
      const res = await invoke<AniMedia[]>("search_anilist_by_studio", {
        studioId: id,
      });
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  const handleTag = useCallback(async (tag: string) => {
    setGlobal(true);
    setSearchTag(tag);
    setSearchMode("tag");
    setLoadingSearch(true);
    setSearchResults([]);
    setSearchTerms("");
    try {
      const res = await invoke<AniMedia[]>("search_anilist_by_tag", { tag });
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  const handleGenre = useCallback(async (genre: string) => {
    setGlobal(true);
    setSearchTag(genre);
    setSearchMode("tag");
    setLoadingSearch(true);
    setSearchResults([]);
    setSearchTerms("");
    try {
      const res = await invoke<AniMedia[]>("search_anilist_by_genre", {
        genre,
      });
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setSearchTerms("");
    setGlobal(false);
    setSearchResults([]);
    setSearchTag(null);
    setSearchMode(null);
    setSearchFilters(defaultFilters);
  }, []);

  const handleLogout = useCallback(async () => {
    await invoke("anilist_logout");
    queryClient.setQueryData(["anilist_data"], {
      user: null,
      lists: [],
      favourites: [],
    });
    setCurrentList("");
  }, [queryClient]);

  const handleRandomFromList = useCallback(() => {
    const list = lists.find((l) => l.name === currentList);
    if (!list?.entries.length) return;
    const idx = Math.floor(Math.random() * list.entries.length);
    const entry = list.entries[idx];
    setSelectedAnime({
      animeId: entry.media.id,
      listEntry: {
        progress: entry.progress,
        score: entry.score,
        list_status: entry.list_status,
      },
    });
  }, [lists, currentList]);

  const entryLookup = useMemo(() => buildEntryLookup(lists), [lists]);

  const openAnimeFromLookup = useCallback(
    (id: number) => {
      setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
    },
    [entryLookup]
  );

  const handleAnimeBack = useMemo(
    () => buildAnimeBackHandler(animeHistory, setAnimeHistory, setSelectedAnime),
    [animeHistory]
  );

  const toggleFavourite = useCallback(
    async (animeId: number) => {
      try {
        const updated = await invoke<FavouriteAnime[]>("toggle_favourite", {
          animeId,
        });
        queryClient.setQueryData(["anilist_data"], (old: unknown) =>
          old ? { ...(old as AnilistRouteData), favourites: updated } : old
        );
      } catch {}
    },
    [queryClient]
  );

  const handleRelated = useCallback(
    (id: number) => {
      setAnimeHistory((prev) =>
        selectedAnime ? [...prev, selectedAnime] : prev
      );
      setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
    },
    [selectedAnime, entryLookup]
  );

  const handleDetailsClose = useCallback(() => {
    setSelectedAnime(null);
    setAnimeHistory([]);
  }, []);

  const handleDetailsSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
  }, [queryClient]);

  const handleAuthSuccess = useCallback(
    (authUser: AniUser) => {
      setAuth(false);
      queryClient.setQueryData(["anilist_data"], {
        user: authUser,
        lists: [],
        favourites: [],
      });
      queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
    },
    [queryClient]
  );

  const handleAddFriend = useCallback(
    (profile: AniUserProfile) => {
      addFriend({
        id: profile.id,
        name: profile.name,
        avatar: profile.avatar,
      });
      cacheFriendProfile(profile);
    },
    [addFriend, cacheFriendProfile]
  );

  const activeEntries =
    lists.find((c) => c.name === currentList)?.entries ?? [];
  const filteredEntries = filterEntries(activeEntries, searchTerms, global);
  const sortedEntries = sortEntries(filteredEntries, sort.dir, sort.key);
  const displayEntries = pickDisplayEntries(
    global,
    searchResults,
    sortedEntries,
    globalSort
  );

  const isLocal = isLocalSearch(searchTerms, global);
  const deferredSearchTerms = useDeferredValue(searchTerms);
  const backendSuggestions = useSugggestions(
    deferredSearchTerms,
    "anilist",
    8
  );
  const suggestions = useMemo(
    () =>
      getSearchSuggestions(deferredSearchTerms, {
        animeEnabled: animeProfileId !== null,
        animeIndex,
        anilistBoost: anilistSuggestionBoost,
        backendSuggestions,
        history: searchHistory,
        queryStats,
        scope: "anilist",
        suggestionStats,
        limit: 8,
      }),
    [
      animeIndex,
      animeProfileId,
      anilistSuggestionBoost,
      backendSuggestions,
      queryStats,
      searchHistory,
      deferredSearchTerms,
      suggestionStats,
    ]
  );
  const inlineCompletion = useMemo(
    () => getInlineCompletion(deferredSearchTerms, suggestions),
    [deferredSearchTerms, suggestions]
  );

  const { total, from, to, lastPage } = usePagination(
    displayEntries.length,
    anilistPageSize,
    page,
    setPage
  );

  const pagedEntries = useMemo(
    () => paginate(displayEntries, page, anilistPageSize),
    [displayEntries, page, anilistPageSize]
  );

  useEffect(() => {
    setPage((p) => Math.min(p, lastPage));
  }, [lastPage]);

  useEffect(() => {
    const current = useSearchStore.getState().anilistSearchQuery;
    if (current) {
      setSearchTerms(current);
      setAnilistSearchQuery(null);
    }
    return useSearchStore.subscribe((state, prev) => {
      if (state.anilistSearchQuery && !prev.anilistSearchQuery) {
        setSearchTerms(state.anilistSearchQuery);
        setAnilistSearchQuery(null);
      }
    });
  }, [setAnilistSearchQuery]);

  return (
    <main className="flex h-full w-full flex-col gap-1">
      {user && !isLoading && (
        <AniListSearchToolbar
          searchTerms={searchTerms}
          onSearchTermsChange={setSearchTerms}
          global={global}
          inlineCompletion={inlineCompletion}
          suggestions={suggestions}
          searchHistory={searchHistory}
          onRecordSuggestion={recordSuggestion}
          onRecordSuggestionIgnored={recordSuggestionIgnored}
          onGlobal={handleGlobal}
          onReset={handleReset}
          filters={searchFilters}
          onFiltersOpen={() => setShowFilters(true)}
          loadingSearch={loadingSearch}
        />
      )}

      <AniListProfileSections
        user={user}
        isLoading={isLoading}
        isLocal={isLocal}
        global={global}
        lists={lists}
        currentList={currentList}
        onSelectList={(name) => {
          setCurrentList(name);
          if (global) handleReset();
        }}
        searchTerms={searchTerms}
        sort={sort}
        onSortChange={setSort}
        hasFavourites={favourites.length > 0}
        onActivityFeed={() => setActivityHistory({ open: true, tab: "feed" })}
        onActivityCalendar={() =>
          setActivityHistory({ open: true, tab: "calendar" })
        }
        onFavourites={() => setShowFavourites(true)}
        onRandom={handleRandomFromList}
        onStats={() => setShowStats(true)}
        onBrowse={() => setShowBrowse(true)}
        onRecs={() => setShowRecs(true)}
        onPrefetch={() => setShowPrefetch(true)}
        onFriends={() => setShowFriends(true)}
        onLogout={handleLogout}
      />

      {global && searchResults.length > 0 && (
        <AniListGlobalSortBar
          sortKey={globalSort.key}
          onSortChange={setGlobalSort}
        />
      )}

      <AniListStateViews
        view={resolveAniListView({
          isLoading,
          hasLists: lists.length > 0,
          global,
          isLocal,
          hasUser: !!user,
          loadingSearch,
          hasSearchResults: searchResults.length > 0,
        })}
        onLogin={() => setAuth(true)}
      />

      <AniListResults
        entries={pagedEntries}
        entryLookup={entryLookup}
        onSelect={(anime) => setSelectedAnime(anime)}
        scrollRef={scrollRef}
        showPagination={(!!user || global) && displayEntries.length > 0}
        pagination={{
          global,
          isLocal,
          hasUser: !!user,
          searchResultsCount: searchResults.length,
          searchTag,
          searchMode,
          currentList,
          filteredCount: filteredEntries.length,
          activeCount: activeEntries.length,
          total,
          page,
          lastPage,
          from,
          to,
          onPageChange: setPage,
        }}
      />

      <AniListDetailModalHost
        selectedAnime={selectedAnime}
        favouriteIds={favouriteIds}
        isLoggedIn={!!user}
        onFavouriteToggle={toggleFavourite}
        onTag={handleTag}
        onGenre={handleGenre}
        onStudio={handleStudio}
        onSeason={handleSeason}
        onRelated={handleRelated}
        onBack={handleAnimeBack}
        onClose={handleDetailsClose}
        onSaved={handleDetailsSaved}
      />

      <AniListSecondaryModals
        entryLookup={entryLookup}
        views={{
          auth,
          recs: showRecs,
          recsLoading,
          activity: activityHistory.open && !!user,
          friends: showFriends && !!user,
          favourites: showFavourites,
          filters: showFilters,
          stats: showStats,
          browse: showBrowse,
          prefetch: showPrefetch,
        }}
        onAuthSuccess={handleAuthSuccess}
        onAuthClose={() => setAuth(false)}
        recs={recs}
        onRecsClose={() => setShowRecs(false)}
        onRecsAnime={openAnimeFromLookup}
        userId={user?.id ?? null}
        friendIds={friendIds}
        lists={lists}
        activityTab={activityHistory.tab}
        onActivityClose={() => setActivityHistory((s) => ({ ...s, open: false }))}
        onActivityAnime={openAnimeFromLookup}
        friends={friends}
        onAddFriend={handleAddFriend}
        onRemoveFriend={removeFriend}
        onFriendsClose={() => setShowFriends(false)}
        favourites={favourites}
        onFavouritesClose={() => setShowFavourites(false)}
        onFavouritesAnime={openAnimeFromLookup}
        filters={searchFilters}
        onFiltersApply={setSearchFilters}
        onFiltersReset={() => setSearchFilters(defaultFilters)}
        onFiltersClose={() => setShowFilters(false)}
        onStatsClose={() => setShowStats(false)}
        onStatsAnime={openAnimeFromLookup}
        onBrowseClose={() => setShowBrowse(false)}
        onBrowseAnime={openAnimeFromLookup}
        animeIds={allAnimeIds}
        onPrefetchClose={() => setShowPrefetch(false)}
      />
    </main>
  );
}

function buildAnimeBackHandler(
  animeHistory: AniListAnime[],
  setAnimeHistory: React.Dispatch<React.SetStateAction<AniListAnime[]>>,
  setSelectedAnime: React.Dispatch<React.SetStateAction<AniListAnime>>
): (() => void) | undefined {
  if (animeHistory.length === 0) return undefined;
  return () => {
    const prev = animeHistory.at(-1);
    if (prev) {
      setAnimeHistory((h) => h.slice(0, -1));
      setSelectedAnime(prev);
    }
  };
}

function pickDisplayEntries(
  global: boolean,
  searchResults: AniMedia[],
  sortedEntries: ReturnType<typeof sortEntries>,
  globalSort: GlobalSort
): AniMedia[] {
  if (global) {
    return sortAniMediaList(searchResults, globalSort.key, globalSort.dir);
  }
  return sortedEntries.map((e) => e.media);
}

function isLocalSearch(searchTerms: string, global: boolean): boolean {
  return searchTerms.trim().length > 0 && !global;
}

function AniListProfileSections({
  user,
  isLoading,
  isLocal,
  global,
  lists,
  currentList,
  onSelectList,
  searchTerms,
  sort,
  onSortChange,
  hasFavourites,
  onActivityFeed,
  onActivityCalendar,
  onFavourites,
  onRandom,
  onStats,
  onBrowse,
  onRecs,
  onPrefetch,
  onFriends,
  onLogout,
}: {
  user: AniUser | null;
  isLoading: boolean;
  isLocal: boolean;
  global: boolean;
  lists: AniListCollection[];
  currentList: string;
  onSelectList: (name: string) => void;
  searchTerms: string;
  sort: AniListSort;
  onSortChange: React.Dispatch<React.SetStateAction<AniListSort>>;
  hasFavourites: boolean;
  onActivityFeed: () => void;
  onActivityCalendar: () => void;
  onFavourites: () => void;
  onRandom: () => void;
  onStats: () => void;
  onBrowse: () => void;
  onRecs: () => void;
  onPrefetch: () => void;
  onFriends: () => void;
  onLogout: () => void;
}) {
  const showProfile = !!user && !global && !isLocal;
  const showListBar = !!user && !global && lists.length > 0;
  return (
    <>
      {showProfile && (
        <AniListProfileHeader
          user={user}
          loadingList={isLoading}
          onStatsOpen={onStats}
          onBrowseOpen={onBrowse}
          onRecsOpen={onRecs}
          onPrefetchOpen={onPrefetch}
          onFriendsOpen={onFriends}
          onLogout={onLogout}
        />
      )}

      {!isLoading && showListBar && (
        <AniListTabs
          lists={lists}
          currentList={currentList}
          onSelect={onSelectList}
          searchTerms={searchTerms}
          global={global}
        />
      )}

      {showListBar && (
        <AniListSortBar
          sort={sort}
          onSortChange={onSortChange}
          onActivityOpen={onActivityFeed}
          onFavouritesOpen={onFavourites}
          onRandom={onRandom}
          onHistoryOpen={onActivityCalendar}
          hasFavourites={hasFavourites}
        />
      )}
    </>
  );
}

function AniListResults({
  entries,
  entryLookup,
  onSelect,
  scrollRef,
  showPagination,
  pagination,
}: {
  entries: AniMedia[];
  entryLookup: ReturnType<typeof buildEntryLookup>;
  onSelect: (anime: AniListAnime) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
  showPagination: boolean;
  pagination: React.ComponentProps<typeof AniListResultsPagination>;
}) {
  return (
    <>
      {entries.length > 0 && (
        <section
          className="windows95-border flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto border bg-white p-1"
          ref={scrollRef}
        >
          {entries.map((item) => (
            <AniListEntryCard
              key={item.id}
              item={item}
              entryLookup={entryLookup}
              onClick={onSelect}
            />
          ))}
        </section>
      )}

      {showPagination && <AniListResultsPagination {...pagination} />}
    </>
  );
}

function AniListSearchToolbar({
  searchTerms,
  onSearchTermsChange,
  global,
  inlineCompletion,
  suggestions,
  searchHistory,
  onRecordSuggestion,
  onRecordSuggestionIgnored,
  onGlobal,
  onReset,
  filters,
  onFiltersOpen,
  loadingSearch,
}: {
  searchTerms: string;
  onSearchTermsChange: (value: string) => void;
  global: boolean;
  inlineCompletion: string | null;
  suggestions: SearchSuggestion[];
  searchHistory: string[];
  onRecordSuggestion: (value: string) => void;
  onRecordSuggestionIgnored: (value: string) => void;
  onGlobal: () => void;
  onReset: () => void;
  filters: AniListFilters;
  onFiltersOpen: () => void;
  loadingSearch: boolean;
}) {
  const { t } = useI18n();
  const activeFilterCount =
    filters.tags.length +
    (filters.format ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.season ? 1 : 0) +
    (filters.adult ? 1 : 0);

  const submitSearch = () => {
    if (
      inlineCompletion &&
      searchTerms.trim().toLocaleLowerCase() !==
        inlineCompletion.toLocaleLowerCase()
    ) {
      onRecordSuggestionIgnored(inlineCompletion);
    }
    onGlobal();
  };

  return (
    <section className="flex w-full flex-row gap-2">
      <InlineAutocompleteInput
        placeholder={t("anilist.route.searchPlaceholder")}
        value={searchTerms}
        completion={inlineCompletion}
        suggestions={suggestions}
        history={searchHistory}
        className="h-9 font-bold"
        autoFocus
        onChange={(e) => {
          onSearchTermsChange(e.target.value);
          if (global && !e.target.value.trim()) onReset();
        }}
        onAcceptCompletion={(value) => {
          onRecordSuggestion(value);
          onSearchTermsChange(value);
        }}
        onDismissCompletion={() => {
          if (inlineCompletion) onRecordSuggestionIgnored(inlineCompletion);
        }}
        onKeyDown={enterSubmit(submitSearch)}
      />
      <Button
        size="icon"
        title={t("anilist.route.filters")}
        onClick={onFiltersOpen}
        className="relative"
      >
        <Filter className="size-4" />
        {activeFilterCount > 0 && (
          <span className="bg-secondary absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs text-white">
            {activeFilterCount}
          </span>
        )}
      </Button>
      <Button
        size="icon"
        title={global ? t("anilist.route.backToProfile") : t("app.search")}
        onClick={() => (global ? onReset() : onGlobal())}
        disabled={loadingSearch}
      >
        {global ? <User className="size-4" /> : <Search className="size-4" />}
      </Button>
    </section>
  );
}

function AniListGlobalSortBar({
  sortKey,
  onSortChange,
}: {
  sortKey: GlobalSort["key"];
  onSortChange: React.Dispatch<React.SetStateAction<GlobalSort>>;
}) {
  const { t } = useI18n();
  const labels: Record<GlobalSort["key"], TranslationKey> = {
    relevance: "anilist.route.sortRelevance",
    title: "anilist.route.sortTitle",
    score: "anilist.route.sortScore",
    year: "anilist.route.sortYear",
  };
  return (
    <section className="windows95-border bg-primary flex flex-row items-center gap-2 px-1 py-0.5">
      <span className="windows95-text text-hint text-xs">
        {t("anilist.route.sorting")}
      </span>
      {(["relevance", "title", "score", "year"] as const).map((s) => {
        const isActive = sortKey === s;
        const isRelevance = s === "relevance";
        return (
          <Button
            key={s}
            variant={isActive ? "outline" : "default"}
            size="default"
            className="px-2 py-0.5"
            onClick={() => {
              if (isRelevance)
                onSortChange({ key: "relevance", dir: "desc" });
              else
                onSortChange((prev) => ({
                  key: s,
                  dir: isActive
                    ? prev.dir === "asc"
                      ? "desc"
                      : "asc"
                    : prev.dir,
                }));
            }}
          >
            {t(labels[s])}
          </Button>
        );
      })}
    </section>
  );
}

type AniListViewState =
  | "loading"
  | "globalLoading"
  | "globalEmpty"
  | "localEmpty"
  | "login";

function resolveAniListView(params: {
  isLoading: boolean;
  hasLists: boolean;
  global: boolean;
  isLocal: boolean;
  hasUser: boolean;
  loadingSearch: boolean;
  hasSearchResults: boolean;
}): AniListViewState | null {
  if (params.isLoading && !params.hasLists) return "loading";
  if (params.global) {
    if (params.loadingSearch) return "globalLoading";
    if (!params.hasSearchResults) return "globalEmpty";
    return null;
  }
  if (params.isLocal) return "localEmpty";
  if (!params.hasUser) return "login";
  return null;
}

function AniListStateViews({
  view,
  onLogin,
}: {
  view: AniListViewState | null;
  onLogin: () => void;
}) {
  const { t } = useI18n();
  switch (view) {
    case "loading":
    case "globalLoading": {
      return (
        <section className="flex flex-1 items-center justify-center">
          <SmallLoader />
        </section>
      );
    }
    case "globalEmpty": {
      return (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <SearchX className="text-hint size-8" />
          <span className="windows95-text">{t("anilist.route.emptyAnilist")}</span>
        </section>
      );
    }
    case "localEmpty": {
      return (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <SearchX className="text-hint size-8" />
          <span className="windows95-text">{t("anilist.route.emptyList")}</span>
        </section>
      );
    }
    case "login": {
      return (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <User className="text-hint size-8" />
          <span className="windows95-text">{t("anilist.route.loginPrompt")}</span>
          <Button onClick={onLogin}>{t("anilist.route.login")}</Button>
        </section>
      );
    }
    default: {
      return null;
    }
  }
}

function AniListResultsPagination({
  global,
  isLocal,
  hasUser,
  searchResultsCount,
  searchTag,
  searchMode,
  currentList,
  filteredCount,
  activeCount,
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
}: {
  global: boolean;
  isLocal: boolean;
  hasUser: boolean;
  searchResultsCount: number;
  searchTag: string | null;
  searchMode: SearchMode;
  currentList: string;
  filteredCount: number;
  activeCount: number;
  total: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const statusText = global
    ? `${t("anilist.route.searchResults", { count: searchResultsCount })}${searchTag ? ` · ${searchMode === "studio" ? t("anilist.route.studio") : searchMode === "season" ? t("anilist.route.season") : t("anilist.route.tag")}: ${searchTag}` : ""}`
    : isLocal
      ? `${currentList}: ${filteredCount} / ${activeCount}`
      : hasUser
        ? `${currentList}: ${activeCount}`
        : undefined;
  return (
    <Pagination
      total={total}
      page={page}
      lastPage={lastPage}
      from={from}
      to={to}
      onPageChange={onPageChange}
      statusText={statusText}
    />
  );
}

function AniListDetailModalHost({
  selectedAnime,
  favouriteIds,
  isLoggedIn,
  onFavouriteToggle,
  onTag,
  onGenre,
  onStudio,
  onSeason,
  onRelated,
  onBack,
  onClose,
  onSaved,
}: {
  selectedAnime: AniListAnime;
  favouriteIds: Set<number>;
  isLoggedIn: boolean;
  onFavouriteToggle: (animeId: number) => Promise<void>;
  onTag: (tag: string) => Promise<void>;
  onGenre: (genre: string) => Promise<void>;
  onStudio: (id: number, name: string) => Promise<void>;
  onSeason: (season: string, seasonYear: number | null) => Promise<void>;
  onRelated: (id: number) => void;
  onBack: (() => void) | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!selectedAnime) return null;
  return (
    <Details
      animeId={selectedAnime.animeId}
      listEntry={selectedAnime.listEntry}
      isLoggedIn={isLoggedIn}
      favouriteIds={favouriteIds}
      onFavouriteToggle={onFavouriteToggle}
      onTag={onTag}
      onGenre={onGenre}
      onStudio={onStudio}
      onSeason={onSeason}
      onRelated={onRelated}
      onBack={onBack}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

type AniListModalViews = {
  auth: boolean;
  recs: boolean;
  recsLoading: boolean;
  activity: boolean;
  friends: boolean;
  favourites: boolean;
  filters: boolean;
  stats: boolean;
  browse: boolean;
  prefetch: boolean;
};

function AniListSecondaryModals({
  entryLookup,
  views,
  onAuthSuccess,
  onAuthClose,
  recs,
  onRecsClose,
  onRecsAnime,
  userId,
  friendIds,
  lists,
  activityTab,
  onActivityClose,
  onActivityAnime,
  friends,
  onAddFriend,
  onRemoveFriend,
  onFriendsClose,
  favourites,
  onFavouritesClose,
  onFavouritesAnime,
  filters,
  onFiltersApply,
  onFiltersReset,
  onFiltersClose,
  onStatsClose,
  onStatsAnime,
  onBrowseClose,
  onBrowseAnime,
  animeIds,
  onPrefetchClose,
}: {
  entryLookup: ReturnType<typeof buildEntryLookup>;
  views: AniListModalViews;
  onAuthSuccess: (user: AniUser) => void;
  onAuthClose: () => void;
  recs: AniRecommendation[];
  onRecsClose: () => void;
  onRecsAnime: (id: number) => void;
  userId: number | null;
  friendIds: number[];
  lists: AniListCollection[];
  activityTab: "feed" | "calendar";
  onActivityClose: () => void;
  onActivityAnime: (id: number) => void;
  friends: AniFriend[];
  onAddFriend: (profile: AniUserProfile) => void;
  onRemoveFriend: (id: number) => void;
  onFriendsClose: () => void;
  favourites: FavouriteAnime[];
  onFavouritesClose: () => void;
  onFavouritesAnime: (id: number) => void;
  filters: AniListFilters;
  onFiltersApply: (filters: AniListFilters) => void;
  onFiltersReset: () => void;
  onFiltersClose: () => void;
  onStatsClose: () => void;
  onStatsAnime: (id: number) => void;
  onBrowseClose: () => void;
  onBrowseAnime: (id: number) => void;
  animeIds: number[];
  onPrefetchClose: () => void;
}) {
  return (
    <>
      {views.auth && <Auth onAuth={onAuthSuccess} onClose={onAuthClose} />}

      <AniListRecsModal
        open={views.recs}
        loading={views.recsLoading}
        recommendations={recs}
        onClose={onRecsClose}
        onAnimeClick={onRecsAnime}
      />

      {views.activity && userId != null && (
        <ActivityHistoryModal
          userId={userId}
          friendIds={friendIds}
          lists={lists}
          initialTab={activityTab}
          onClose={onActivityClose}
          onAnimeClick={onActivityAnime}
        />
      )}

      {views.friends && (
        <AniListFriendsModal
          friends={friends}
          onAdd={onAddFriend}
          onRemove={onRemoveFriend}
          onClose={onFriendsClose}
        />
      )}

      <AniListFavouritesModal
        open={views.favourites}
        favourites={favourites}
        onClose={onFavouritesClose}
        onAnimeClick={onFavouritesAnime}
      />

      <FiltersModal
        open={views.filters}
        filters={filters}
        onApply={onFiltersApply}
        onReset={onFiltersReset}
        onClose={onFiltersClose}
      />

      {views.stats && (
        <StatsModal lists={lists} onClose={onStatsClose} onAnimeClick={onStatsAnime} />
      )}

      {views.browse && (
        <BrowseAnimeModal
          entries={entryLookup}
          onClose={onBrowseClose}
          onAnimeClick={onBrowseAnime}
        />
      )}

      {views.prefetch && (
        <PrefetchRelationsModal animeIds={animeIds} onClose={onPrefetchClose} />
      )}
    </>
  );
}

export default AnilistRoute;
