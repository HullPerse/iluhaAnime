import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAnilistDetail } from "@/hooks/anilist/detail.hook";
import { useFavouritePeopleToggles, useSyncFavPeopleAnimeIds } from "@/hooks/anilist/people.hook";
import { useAnilistRandom } from "@/hooks/anilist/random.hook";
import { useAnilistSearch } from "@/hooks/anilist/search.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { useAutocomplete } from "@/hooks/search/autocomplete.hook";
import {
  filterEntries,
  sortEntries,
} from "@/lib/anilist/entries.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import {
  pickDisplayEntries,
  isLocalSearch,
  resolveAniListView,
} from "@/lib/anilist/route.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { useAniListFriendsStore } from "@/store/anilist.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniListCollection,
  AniListSort,
  AniRecommendation,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
  FavouritePeople,
  GlobalSort,
  AnilistRouteData,
} from "@/types/anilist";

const NO_PEOPLE: FavouritePeople = { staff: [], characters: [] };
const NO_LISTS: AniListCollection[] = [];
const NO_FAVOURITES: FavouriteAnime[] = [];

import AniListDetailModalHost from "./components/anilist/detail/host.detail";
import { defaultFilters } from "./components/anilist/filters.anilist";
import AniListGlobalSortBar from "./components/anilist/globalSortBar.anilist";
import AniListProfileSections from "./components/anilist/profileSections.anilist";
import AniListResults from "./components/anilist/results.anilist";
import AniListSearchToolbar from "./components/anilist/searchToolbar.anilist";
import AniListSecondaryModals from "./components/anilist/secondaryModals.anilist";
import SpotlightModal from "./components/anilist/spotlight/modal.spotlight";
import AniListStateViews from "./components/anilist/stateViews.anilist";

function routePeople(data: AnilistRouteData | undefined): FavouritePeople {
  return data?.people ?? NO_PEOPLE;
}

function AnilistRoute() {
  const queryClient = useQueryClient();
  const setAnilistSearchQuery = useSearchStore((state) => state.setAnilistSearchQuery);
  const indexAniList = useSearchStore((state) => state.indexAniList);
  const animeIndex = useSearchStore((state) => state.animeIndex);
  const animeProfileId = useSearchStore((state) => state.animeProfileId);
  const searchHistory = useSearchStore((state) => state.history);
  const queryStats = useSearchStore((state) => state.queryStats);
  const suggestionStats = useSearchStore((state) => state.suggestionStats);
  const recordSuggestionIgnored = useSearchStore((state) => state.recordSuggestionIgnored);
  const recordSuggestion = useSearchStore((state) => state.recordSuggestion);

  const [currentList, setCurrentList] = useState<string>("");
  const [auth, setAuth] = useState<boolean>(false);
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
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useQuery<AnilistRouteData>({
    queryKey: ["anilist_data"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const user = await invokeTyped<AniUser | null>(
        "check_anilist_auth",
        anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl)
      );
      if (!user)
        return { user: null, lists: [], favourites: [], people: { staff: [], characters: [] } };
      const [lists, favourites, people] = await Promise.all([
        invokeTyped<AniListCollection[]>("get_anilist_lists", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
        invokeTyped<FavouriteAnime[]>("get_favourites", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
        invokeTyped<FavouritePeople>("get_favourite_people", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
      ]);
      return { user, lists, favourites, people };
    },
    placeholderData: (previous) => previous,
  });

  const user = data?.user ?? null;
  const lists = data?.lists ?? NO_LISTS;
  const favourites = data?.favourites ?? NO_FAVOURITES;

  useEffect(() => {
    if (!user) return;
    invokeTyped("sync_franchise_to_index").catch((error) =>
      reportBackgroundError("franchise.sync", error)
    );
  }, [user]);

  const favouriteIds = useMemo(() => new Set(favourites.map((f) => f.id)), [favourites]);

  const people = routePeople(data);
  const favouriteStaffIds = useMemo(() => new Set(people.staff.map((p) => p.id)), [people]);
  const favouriteCharacterIds = useMemo(
    () => new Set(people.characters.map((p) => p.id)),
    [people]
  );
  useSyncFavPeopleAnimeIds(user, people.staff, people.characters, !!user);
  const sharedFavPeopleIds = useSearchStore((s) => s.favPeopleAnimeIds);
  const favPeopleAnimeIds = useMemo(() => new Set(sharedFavPeopleIds), [sharedFavPeopleIds]);

  useEffect(() => {
    if (user) indexAniList(lists, favourites, user.id, favPeopleAnimeIds);
  }, [favPeopleAnimeIds, favourites, indexAniList, lists, user]);
  const friends = useAniListFriendsStore((state) => state.friends);

  const addFriend = useAniListFriendsStore((state) => state.addFriend);
  const cacheFriendProfile = useAniListFriendsStore((state) => state.cacheProfile);
  const removeFriend = useAniListFriendsStore((state) => state.removeFriend);
  const friendIds = useMemo(() => [...new Set(friends.map((friend) => friend.id))], [friends]);

  const allAnimeIds = useMemo(
    () => lists.flatMap((l) => l.entries.map((e) => e.media.id)),
    [lists]
  );

  useEffect(() => {
    if (!showRecs || !user) return;
    setRecsLoading(true);
    invokeTyped<AniRecommendation[]>("get_profile_recommendations", {
      userId: user.id,
      ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
    })
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
  }, [showRecs, user]);

  const [sort, setSort] = useState<AniListSort>({ key: "title", dir: "asc" });
  const [globalSort, setGlobalSort] = useState<GlobalSort>({
    key: "relevance",
    dir: "desc",
  });
  const [page, setPage] = useState<number>(1);
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
  const {
    global,
    handleGenre,
    handleGlobal,
    handleReset,
    handleSeason,
    handleStudio,
    handleTag,
    loadingSearch,
    searchFilters,
    searchMode,
    searchResults,
    searchTag,
    searchTerms,
    setSearchFilters,
    setSearchTerms,
  } = useAnilistSearch();

  const handleLogout = useCallback(async () => {
    await invokeTyped("anilist_logout");
    queryClient.setQueryData(["anilist_data"], {
      user: null,
      lists: [],
      favourites: [],
      people: { staff: [], characters: [] },
    });
    setCurrentList("");
  }, [queryClient]);

  const {
    selectedAnime,
    detailFromFilters,
    entryLookup,
    showDetail,
    openAnimeFromLookup,
    handleAnimeBack,
    handleRelated,
    handleDetailsClose,
  } = useAnilistDetail(lists);
  const { randomPending, handleRandomFromList, handleFilterRandom } = useAnilistRandom(
    lists,
    currentList,
    entryLookup,
    showDetail
  );
  const toggleFavourite = useCallback(
    async (animeId: number) => {
      try {
        const updated = await invokeTyped<FavouriteAnime[]>("toggle_favourite", {
          animeId,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
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

  const { toggleStaff: toggleFavouriteStaff, toggleCharacter: toggleFavouriteCharacter } =
    useFavouritePeopleToggles();

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
        people: { staff: [], characters: [] },
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

  const { deferredQuery: deferredSearchTerms, suggestions, inlineCompletion } = useAutocomplete(
    {
      query: searchTerms,
      scope: "anilist",
      limit: 8,
      history: searchHistory,
      queryStats,
      suggestionStats,
      animeIndex,
      animeProfileId,
      anilistBoost: anilistSuggestionBoost,
    }
  );

  const activeEntries = lists.find((c) => c.name === currentList)?.entries ?? [];
  const filteredEntries = filterEntries(activeEntries, deferredSearchTerms, global);
  const sortedEntries = sortEntries(filteredEntries, sort.dir, sort.key);
  const displayEntries = pickDisplayEntries(global, searchResults, sortedEntries, globalSort);
  const isLocal = isLocalSearch(searchTerms, global);

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
  }, [setAnilistSearchQuery, setSearchTerms]);

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
        onSpotlight={() => setShowSpotlight(true)}
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
        favouriteIds={favouriteIds}
        onSelect={(anime) => showDetail(anime, detailFromFilters)}
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
        favouriteStaffIds={favouriteStaffIds}
        favouriteCharacterIds={favouriteCharacterIds}
        isLoggedIn={!!user}
        onFavouriteToggle={toggleFavourite}
        onStaffFavouriteToggle={toggleFavouriteStaff}
        onCharacterFavouriteToggle={toggleFavouriteCharacter}
        onTag={handleTag}
        onGenre={handleGenre}
        onStudio={handleStudio}
        onSeason={handleSeason}
        onRelated={handleRelated}
        onBack={handleAnimeBack}
        onClose={handleDetailsClose}
        onSaved={handleDetailsSaved}
      />

      {showSpotlight && (
        <SpotlightModal
          hasUser={!!user}
          onDetails={openAnimeFromLookup}
          isFavorite={(id) => favouriteIds.has(id)}
          onClose={() => setShowSpotlight(false)}
        />
      )}

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
        onFiltersRandom={handleFilterRandom}
        randomPending={randomPending}
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
