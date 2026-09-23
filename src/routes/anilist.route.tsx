import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { defaultFilters } from "@/config/anilist/filters.config";
import { useAnilistDetail } from "@/hooks/anilist/detail.hook";
import { useAnilistListView } from "@/hooks/anilist/listView.hook";
import { useAnilistModals } from "@/hooks/anilist/modals.hook";
import { useFavouritePeopleToggles } from "@/hooks/anilist/people.hook";
import { useAnilistRandom } from "@/hooks/anilist/random.hook";
import { useAnilistSearch } from "@/hooks/anilist/search.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { filterEntries, sortEntries } from "@/lib/anilist/entries.utils";
import { ALL_LISTS_ID, activeListEntries } from "@/lib/anilist/group.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import {
  pickDisplayEntries,
  isLocalSearch,
  resolveAniListView,
  routePeople,
} from "@/lib/anilist/route.utils";
import { translate } from "@/lib/locale/i18n.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { useAniListFriendsStore } from "@/store/anilist.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniFriend,
  AniListAnime,
  AniListSort,
  AniRecommendation,
  AniUser,
  AniUserProfile,
  AnilistRouteData,
  FavouriteAnime,
  GlobalSort,
} from "@/types/anilist";

import AniListDetailModalHost from "./components/anilist/detail/host.detail";
import { useFriendAnilistData } from "./components/anilist/friend/data.friend";
import AniListGlobalSortBar from "./components/anilist/globalSortBar.anilist";
import AniListProfileSections from "./components/anilist/profileSections.anilist";
import AniListResultsHost from "./components/anilist/resultsHost.anilist";
import AniListSearchToolbar from "./components/anilist/searchToolbar.anilist";
import AniListSecondaryModals from "./components/anilist/secondaryModals.anilist";
import { buildAniListSource } from "./components/anilist/source.anilist";
import SpotlightModal from "./components/anilist/spotlight/modal.spotlight";
import AniListStateViews from "./components/anilist/stateViews.anilist";
import { useUserAnilistData } from "./components/anilist/user/data.user";

function AnilistRoute() {
  const queryClient = useQueryClient();
  const setAnilistSearchQuery = useSearchStore((state) => state.setAnilistSearchQuery);
  const indexAniList = useSearchStore((state) => state.indexAniList);
  const animeIndex = useSearchStore((state) => state.animeIndex);
  const animeProfileId = useSearchStore((state) => state.animeProfileId);
  const searchHistory = useSearchStore((state) => state.history);
  const queryStats = useSearchStore((state) => state.queryStats);
  const suggestionStats = useSearchStore((state) => state.suggestionStats);

  const [currentList, setCurrentList] = useState<string>("");
  const { views, handleOpenModal, handleCloseModal, handleOpenActivity, handleCloseActivity } =
    useAnilistModals();
  const [recs, setRecs] = useState<AniRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [viewedFriend, setViewedFriend] = useState<AniFriend | null>(null);

  const self = useUserAnilistData();
  const friendData = useFriendAnilistData(viewedFriend);

  const user = self.user;
  const lists = self.lists;
  const favourites = self.favourites;

  useEffect(() => {
    if (!user) return;
    invokeTyped("sync_franchise_to_index").catch((error) =>
      reportBackgroundError("franchise.sync", error)
    );
  }, [user]);

  const favouriteIds = useMemo(() => new Set(favourites.map((f) => f.id)), [favourites]);

  const people = routePeople(self.data);
  const favouriteStaffIds = useMemo(() => new Set(people.staff.map((p) => p.id)), [people]);
  const favouriteCharacterIds = useMemo(
    () => new Set(people.characters.map((p) => p.id)),
    [people]
  );
  useEffect(() => {
    if (user) indexAniList(lists, favourites, user.id);
  }, [favourites, indexAniList, lists, user]);

  const friends = useAniListFriendsStore((state) => state.friends);
  const addFriend = useAniListFriendsStore((state) => state.addFriend);
  const cacheFriendProfile = useAniListFriendsStore((state) => state.cacheProfile);
  const removeFriend = useAniListFriendsStore((state) => state.removeFriend);
  const friendIds = useMemo(() => [...new Set(friends.map((friend) => friend.id))], [friends]);

  useEffect(() => {
    if (friendData.profile) cacheFriendProfile(friendData.profile);
  }, [cacheFriendProfile, friendData.profile]);

  const allAnimeIds = useMemo(
    () => lists.flatMap((l) => l.entries.map((e) => e.media.id)),
    [lists]
  );

  useEffect(() => {
    if (!views.recs || !user) return;
    setRecsLoading(true);
    (async () => {
      const [recs, error] = await attempt(
        invokeTyped<AniRecommendation[]>("get_profile_recommendations", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        })
      );
      if (error) setRecs([]);
      else setRecs(recs);
      setRecsLoading(false);
    })();
  }, [views.recs, user]);

  const sort = useSettingsStore((s) => s.anilistListSort);
  const setSort = useCallback((next: AniListSort) => {
    useSettingsStore.getState().patch({ anilistListSort: next });
  }, []);
  const groupByStatus = useSettingsStore((s) => s.anilistGroupByStatus);
  const displayMode = useSettingsStore((s) => s.anilistDisplayMode);
  const collapsedNames = useSettingsStore((s) => s.anilistCollapsedLists);
  const setGroupByStatus = useCallback((grouped: boolean) => {
    useSettingsStore.getState().patch({ anilistGroupByStatus: grouped });
  }, []);
  const setDisplayMode = useCallback((mode: "scroll" | "pagination") => {
    useSettingsStore.getState().patch({ anilistDisplayMode: mode });
  }, []);
  const toggleListCollapsed = useCallback((name: string) => {
    const current = useSettingsStore.getState().anilistCollapsedLists;
    const next = current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name];
    useSettingsStore.getState().patch({ anilistCollapsedLists: next });
  }, []);
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
    setViewedFriend(null);
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

  const source = useMemo(
    () =>
      buildAniListSource({
        entryLookup,
        favouriteIds,
        favourites,
        friend: viewedFriend,
        friendData: viewedFriend
          ? {
              displayFavouriteIds: friendData.displayFavouriteIds,
              entryLookup: friendData.entryLookup,
              favourites: friendData.favourites,
              lists: friendData.lists,
              profile: friendData.profile,
            }
          : null,
        lists,
        user,
      }),
    [
      entryLookup,
      favouriteIds,
      favourites,
      friendData.displayFavouriteIds,
      friendData.entryLookup,
      friendData.favourites,
      friendData.lists,
      friendData.profile,
      lists,
      user,
      viewedFriend,
    ]
  );

  const { randomPending, handleRandomFromList, handleFilterRandom } = useAnilistRandom(
    source.lists,
    currentList,
    entryLookup,
    showDetail
  );
  const favPendingRef = useRef(false);
  const toggleFavourite = useCallback(
    async (animeId: number) => {
      if (favPendingRef.current) return;
      favPendingRef.current = true;
      const [updated, error] = await attempt(
        invokeTyped<FavouriteAnime[]>("toggle_favourite", {
          animeId,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        })
      );
      if (error) {
        useNotificationStore
          .getState()
          .add(
            translate(useSettingsStore.getState().language, "anilist.fav.toggle.failed"),
            "error",
            error.message
          );
      } else {
        queryClient.setQueryData(["anilist_data"], (old: unknown) =>
          old ? { ...(old as AnilistRouteData), favourites: updated } : old
        );
      }
      favPendingRef.current = false;
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
      handleCloseModal("auth");
      queryClient.setQueryData(["anilist_data"], {
        user: authUser,
        lists: [],
        favourites: [],
        people: { staff: [], characters: [] },
      });
      queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
    },
    [queryClient, handleCloseModal]
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

  const openFriend = useCallback(
    (friend: AniFriend) => {
      setViewedFriend(friend);
      handleCloseModal("friends");
      setCurrentList(ALL_LISTS_ID);
      setPage(1);
      setSearchTerms("");
      if (global) handleReset();
    },
    [global, handleReset, setSearchTerms, handleCloseModal]
  );

  const backToSelf = useCallback(() => {
    setViewedFriend(null);
    setCurrentList(ALL_LISTS_ID);
    setPage(1);
  }, []);

  const handleSelectAnime = useCallback(
    (anime: AniListAnime) => {
      if (!anime) return;
      if (source.mode === "friend") {
        openAnimeFromLookup(anime.animeId);
        return;
      }
      showDetail(anime, detailFromFilters);
    },
    [detailFromFilters, openAnimeFromLookup, showDetail, source.mode]
  );

  const field = useSearchField({
    query: searchTerms,
    setQuery: setSearchTerms,
    scope: "anilist",
    limit: 8,
    history: searchHistory,
    queryStats,
    suggestionStats,
    animeIndex,
    animeProfileId,
    anilistBoost: anilistSuggestionBoost,
  });
  const { deferredQuery: deferredSearchTerms } = field;
  const activeEntries = useMemo(
    () => activeListEntries(source.lists, currentList),
    [source.lists, currentList]
  );
  const filteredEntries = filterEntries(activeEntries, deferredSearchTerms, global);
  const sortedEntries = sortEntries(filteredEntries, sort.dir, sort.key);
  const displayEntries = pickDisplayEntries(global, searchResults, sortedEntries, globalSort);
  const { grouped, collapsedLists, useScrollView, effectiveDisplayMode } = useAnilistListView({
    lists: source.lists,
    sort,
    searchTerms: deferredSearchTerms,
    groupByStatus,
    displayMode,
    collapsedNames,
    user,
    global,
  });
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

  const friendState: "loading" | "error" | null = viewedFriend
    ? friendData.isLoading
      ? "loading"
      : friendData.isError
        ? "error"
        : null
    : null;
  const headerLoading = source.mode === "friend" ? friendState === "loading" : self.isLoading;

  return (
    <div className="flex h-full w-full flex-col gap-1">
      {user && !self.isLoading && source.caps.search && (
        <AniListSearchToolbar
          field={field}
          global={global}
          onGlobal={handleGlobal}
          onReset={handleReset}
          filters={searchFilters}
          onFiltersOpen={() => handleOpenModal("filters")}
          loadingSearch={loadingSearch}
        />
      )}

      <AniListProfileSections
        source={source}
        isLoading={headerLoading}
        isLocal={isLocal}
        global={global}
        currentList={currentList}
        onSelectList={(name) => {
          setCurrentList(name);
          if (global) handleReset();
        }}
        searchTerms={searchTerms}
        sort={sort}
        onSortChange={setSort}
        hasFavourites={favourites.length > 0}
        grouped={grouped !== null}
        groupByStatus={groupByStatus}
        onGroupChange={setGroupByStatus}
        displayMode={effectiveDisplayMode}
        onDisplayChange={setDisplayMode}
        onActivityFeed={() => handleOpenActivity("feed")}
        onFavourites={() => handleOpenModal("favourites")}
        onRandom={handleRandomFromList}
        onStats={() => handleOpenModal("stats")}
        onBrowse={() => handleOpenModal("browse")}
        onRecs={() => handleOpenModal("recs")}
        onPrefetch={() => handleOpenModal("prefetch")}
        onSpotlight={() => handleOpenModal("spotlight")}
        onFriends={() => handleOpenModal("friends")}
        onLogout={handleLogout}
        onBackToSelf={backToSelf}
      />

      {global && searchResults.length > 0 && (
        <AniListGlobalSortBar sort={globalSort} onSortChange={setGlobalSort} />
      )}

      <AniListStateViews
        view={resolveAniListView({
          friendState,
          isLoading: self.isLoading,
          hasLists: source.lists.length > 0,
          global,
          isLocal,
          hasUser: !!user,
          loadingSearch,
          hasSearchResults: searchResults.length > 0,
        })}
        onLogin={() => handleOpenModal("auth")}
      />

      <AniListResultsHost
        scroll={useScrollView}
        items={displayEntries}
        pagedEntries={pagedEntries}
        entryLookup={source.displayLookup}
        favouriteIds={source.displayFavouriteIds}
        onSelect={handleSelectAnime}
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
        groups={grouped}
        collapsedLists={collapsedLists}
        onToggleListCollapsed={toggleListCollapsed}
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

      {views.spotlight && source.caps.modals && (
        <SpotlightModal
          hasUser={!!user}
          onDetails={openAnimeFromLookup}
          isFavorite={(id) => favouriteIds.has(id)}
          onClose={() => handleCloseModal("spotlight")}
        />
      )}

      {source.caps.modals && (
        <AniListSecondaryModals
          entryLookup={entryLookup}
          views={{
            auth: views.auth,
            recs: views.recs,
            recsLoading,
            activity: views.activity.open && !!user,
            friends: views.friends && !!user,
            favourites: views.favourites,
            filters: views.filters,
            stats: views.stats,
            browse: views.browse,
            prefetch: views.prefetch,
          }}
          onAuthSuccess={handleAuthSuccess}
          onAuthClose={() => handleCloseModal("auth")}
          recs={recs}
          onRecsClose={() => handleCloseModal("recs")}
          onRecsAnime={openAnimeFromLookup}
          userId={user?.id ?? null}
          friendIds={friendIds}
          lists={lists}
          activityTab={views.activity.tab}
          onActivityClose={handleCloseActivity}
          onActivityAnime={openAnimeFromLookup}
          friends={friends}
          onAddFriend={handleAddFriend}
          onRemoveFriend={removeFriend}
          onViewFriendLists={openFriend}
          onFriendsClose={() => handleCloseModal("friends")}
          favourites={favourites}
          onFavouritesClose={() => handleCloseModal("favourites")}
          onFavouritesAnime={openAnimeFromLookup}
          filters={searchFilters}
          onFiltersApply={setSearchFilters}
          onFiltersReset={() => setSearchFilters(defaultFilters)}
          onFiltersClose={() => handleCloseModal("filters")}
          onFiltersRandom={handleFilterRandom}
          randomPending={randomPending}
          onStatsClose={() => handleCloseModal("stats")}
          onStatsAnime={openAnimeFromLookup}
          onBrowseClose={() => handleCloseModal("browse")}
          onBrowseAnime={openAnimeFromLookup}
          animeIds={allAnimeIds}
          onPrefetchClose={() => handleCloseModal("prefetch")}
        />
      )}
    </div>
  );
}

export default AnilistRoute;
