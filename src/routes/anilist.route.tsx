import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";

import { seasonLabels } from "@/config/anilist/labels.config";
import { usePagination } from "@/hooks/pagination.hook";
import { useSuggestions } from "@/hooks/search/suggestion.hook";
import {
  filterEntries,
  sortEntries,
  buildEntryLookup,
  searchFiltersToParams,
} from "@/lib/anilist/entries.utils";
import {
  buildAnimeBackHandler,
  pickDisplayEntries,
  isLocalSearch,
  resolveAniListView,
} from "@/lib/anilist/route.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { getInlineCompletion, getSearchSuggestions } from "@/lib/search/suggestions.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { useAniListFriendsStore } from "@/store/anilist.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
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

const NO_LISTS: AniListCollection[] = [];
const NO_FAVOURITES: FavouriteAnime[] = [];

import AniListDetailModalHost from "./components/anilist/detail/host.detail";
import { defaultFilters } from "./components/anilist/filters.anilist";
import AniListGlobalSortBar from "./components/anilist/globalSortBar.anilist";
import AniListProfileSections from "./components/anilist/profileSections.anilist";
import AniListResults from "./components/anilist/results.anilist";
import AniListSearchToolbar from "./components/anilist/searchToolbar.anilist";
import AniListSecondaryModals from "./components/anilist/secondaryModals.anilist";
import AniListStateViews from "./components/anilist/stateViews.anilist";

function AnilistRoute() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const setAnilistSearchQuery = useSearchStore((state) => state.setAnilistSearchQuery);
  const indexAniList = useSearchStore((state) => state.indexAniList);
  const animeIndex = useSearchStore((state) => state.animeIndex);
  const animeProfileId = useSearchStore((state) => state.animeProfileId);
  const searchHistory = useSearchStore((state) => state.history);
  const queryStats = useSearchStore((state) => state.queryStats);
  const suggestionStats = useSearchStore((state) => state.suggestionStats);
  const addQuery = useSearchStore((state) => state.addQuery);
  const recordSuggestion = useSearchStore((state) => state.recordSuggestion);
  const recordSuggestionIgnored = useSearchStore((state) => state.recordSuggestionIgnored);

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
  const [searchFilters, setSearchFilters] = useState<AniListFilters>(defaultFilters);

  const { data, isLoading } = useQuery<AnilistRouteData>({
    queryKey: ["anilist_data"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const user = await invokeTyped<AniUser | null>("check_anilist_auth");
      if (!user) return { user: null, lists: [], favourites: [] };
      const [lists, favourites] = await Promise.all([
        invokeTyped<AniListCollection[]>("get_anilist_lists", { userId: user.id }),
        invokeTyped<FavouriteAnime[]>("get_favourites", { userId: user.id }),
      ]);
      return { user, lists, favourites };
    },
  });

  const user = data?.user ?? null;
  const lists = data?.lists ?? NO_LISTS;
  const favourites = data?.favourites ?? NO_FAVOURITES;

  useEffect(() => {
    if (user) indexAniList(lists, favourites, user.id);
  }, [favourites, indexAniList, lists, user]);

  useEffect(() => {
    if (!user) return;
    invokeTyped("sync_franchise_to_index").catch(() => {});
  }, [user]);

  const friends = useAniListFriendsStore((state) => state.friends);
  const addFriend = useAniListFriendsStore((state) => state.addFriend);
  const cacheFriendProfile = useAniListFriendsStore((state) => state.cacheProfile);
  const removeFriend = useAniListFriendsStore((state) => state.removeFriend);
  const friendIds = useMemo(() => [...new Set(friends.map((friend) => friend.id))], [friends]);

  const favouriteIds = useMemo(() => new Set(favourites.map((f) => f.id)), [favourites]);

  const allAnimeIds = useMemo(
    () => lists.flatMap((l) => l.entries.map((e) => e.media.id)),
    [lists]
  );

  useEffect(() => {
    if (!showRecs || !user) return;
    setRecsLoading(true);
    invokeTyped<AniRecommendation[]>("get_profile_recommendations", {
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
  const pageSize = useSettingsStore((s) => s.pageSize);
  const anilistSuggestionBoost = useSettingsStore((s) => s.anilistSuggestionBoost);
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

  const handleGlobal = async () => {
    const query = searchTerms.trim();
    if (query) addQuery(query, "anilist");
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    try {
      const params = searchFiltersToParams(
        searchFilters,
        searchTerms.trim() || null,
        useSettingsStore.getState().pageSize,
        useSettingsStore.getState().anilistMaxPages
      );
      const res = await invokeTyped<AniMedia[]>("search_anilist", params);
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  };

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
        const res = await invokeTyped<AniMedia[]>("search_anilist", {
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
          perPage: useSettingsStore.getState().pageSize,
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
      const res = await invokeTyped<AniMedia[]>("search_anilist_by_studio", {
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
      const res = await invokeTyped<AniMedia[]>("search_anilist_by_tag", { tag });
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
      const res = await invokeTyped<AniMedia[]>("search_anilist_by_genre", {
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
    await invokeTyped("anilist_logout");
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
        const updated = await invokeTyped<FavouriteAnime[]>("toggle_favourite", {
          animeId,
        });
        queryClient.setQueryData(["anilist_data"], (old: unknown) =>
          old ? { ...(old as AnilistRouteData), favourites: updated } : old
        );
      } catch (error) {
        console.warn("toggle_favourite failed", error);
      }
    },
    [queryClient]
  );

  const handleRelated = useCallback(
    (id: number) => {
      setAnimeHistory((prev) => (selectedAnime ? [...prev, selectedAnime] : prev));
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

  const activeEntries = lists.find((c) => c.name === currentList)?.entries ?? [];
  const filteredEntries = filterEntries(activeEntries, searchTerms, global);
  const sortedEntries = sortEntries(filteredEntries, sort.dir, sort.key);
  const displayEntries = pickDisplayEntries(global, searchResults, sortedEntries, globalSort);

  const isLocal = isLocalSearch(searchTerms, global);
  const deferredSearchTerms = useDeferredValue(searchTerms);
  const backendSuggestions = useSuggestions(deferredSearchTerms, "anilist", 8);
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
    pageSize,
    page,
    setPage
  );

  const pagedEntries = useMemo(
    () => paginate(displayEntries, page, pageSize),
    [displayEntries, page, pageSize]
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
    <div className="flex h-full w-full flex-col gap-1">
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
        <AniListGlobalSortBar sort={globalSort} onSortChange={setGlobalSort} />
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
          scrollRef,
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
    </div>
  );
}

export default AnilistRoute;
