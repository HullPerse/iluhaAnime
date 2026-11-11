import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import {
  useAnilistEntries,
  useAnilistIdentity,
  useAnilistSource,
} from "@/hooks/anilist/derived.hook";
import { useAnilistDetail } from "@/hooks/anilist/detail.hook";
import { useRandomDiscovery } from "@/hooks/anilist/discovery.hook";
import { useAnilistListView } from "@/hooks/anilist/listView.hook";
import { useAnilistLocalFilter } from "@/hooks/anilist/localFilter.hook";
import { useAnilistModals } from "@/hooks/anilist/modals.hook";
import { useFavouritePeopleToggles } from "@/hooks/anilist/people.hook";
import { useAnilistRandom } from "@/hooks/anilist/random.hook";
import { useAnilistSearch, useProfileRecs } from "@/hooks/anilist/search.hook";
import { prefetchAnilistStatistics } from "@/hooks/anilist/stats.hook";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useAnilistAuth } from "@/hooks/anilist/auth.hook";
import { useAnilistFavouriteToggle } from "@/hooks/anilist/favourite.hook";
import { defaultAniListFilters } from "@/lib/anilist/anilistFilters.utils";
import { ALL_LISTS_ID } from "@/lib/anilist/anilistGroup.utils";
import { buildAnilistSourceKey, resolveAniListView, resolveFriendState } from "@/lib/anilist/anilistRoute.utils";
import { parseScoreFormat, resolveDisplayScoreFormat } from "@/lib/anilist/anilistScore.utils";
import { focusMainSearch } from "@/lib/ui/focusHotkeys.utils";
import { ignoreTabCycle, stepTabId } from "@/lib/ui/tabsHotkeys.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { showErrorOnce } from "@/lib/core/ui/notification.utils";
import { paginate } from "@/lib/core/collection/pagination.utils";
import {
  addAnilistFriend,
  cacheAnilistProfile,
  removeAnilistFriend,
} from "@/store/anilist.store";
import { searchAtoms, setAnilistSearchQuery, subscribeSearch } from "@/store/search.store";
import { patchSettings, settingsAtoms, syncCoverModeWithAnilistAuth } from "@/store/settings.store";
import type {
  ActivityDetailBundle,
  AniFriend,
  AniFriendMinimal,
  AniListAnime,
  AniListSort,
  AniUserProfile,
  GlobalSort,
} from "@/types/anilist/anilist";

import AniListDetailModalHost from "@/routes/components/anilist/detail/host.detail";
import GlobalSearchFooter from "@/routes/components/anilist/globalSearchFooter.anilist";
import { useFriendAnilistData } from "@/routes/components/anilist/friend/data.friend";
import AniListGlobalSortBar from "@/routes/components/anilist/globalSortBar.anilist";
import AniListProfileSections from "@/routes/components/anilist/profileSections.anilist";
import AniListResultsHost from "@/routes/components/anilist/resultsHost.anilist";
import AniListSearchToolbar from "@/routes/components/anilist/searchToolbar.anilist";
import AniListSecondaryModals from "@/routes/components/anilist/secondaryModals.anilist";
import SpotlightModal from "@/routes/components/anilist/spotlight/modal.spotlight";
import AniListStateViews from "@/routes/components/anilist/stateViews.anilist";
import { useUserAnilistData } from "@/routes/components/anilist/user/data.user";

function AnilistRoute() {
  const { t } = useI18n();
  useResolvedHotkeys<"focus-main">(
    [{ id: "focus-main", chord: "ctrl+KeyK", repeat: "once", keybindId: "focus.main" }],
    {
      onAction: () => focusMainSearch(),
    }
  );
  const queryClient = useQueryClient();
  const animeIndex = useCell(searchAtoms.animeIndex);
  const animeProfileId = useCell(searchAtoms.animeProfileId);
  const searchHistory = useCell(searchAtoms.history);
  const queryStats = useCell(searchAtoms.queryStats);
  const suggestionStats = useCell(searchAtoms.suggestionStats);

  const [currentList, setCurrentList] = useState<string>("");
  const { views, handleOpenModal, handleCloseModal, handleOpenActivity, handleCloseActivity } =
    useAnilistModals();
  const [viewedFriend, setViewedFriend] = useState<AniFriend | null>(null);

  const self = useUserAnilistData();
  const friendData = useFriendAnilistData(viewedFriend);

  const user = self.user;
  const lists = self.lists;
  const favourites = self.favourites;
  const { recs, recsLoading } = useProfileRecs(user, views.recs);

  useEffect(() => {
    if (user) prefetchAnilistStatistics(queryClient, user.id);
  }, [queryClient, user]);

  useEffect(() => {
    if (!user) return;
    anilistApi.syncFranchiseToIndex().catch((error: unknown) => {
      reportBackgroundError("franchise.sync", error);
      if (settingsAtoms.notifyScanErrors.get())
        showErrorOnce(
          "franchise-sync",
          t("notification.sync.failed"),
          error instanceof Error ? error.message : String(error)
        );
    });
  }, [t, user]);

  const {
    people,
    friends,
    favouriteIds,
    favouriteStaffIds,
    favouriteCharacterIds,
    friendIds,
    allAnimeIds,
    listIds,
    hasFavourites,
  } = useAnilistIdentity({ data: self.data, lists, favourites });

  useEffect(() => {
    if (friendData.profile) cacheAnilistProfile(friendData.profile);
  }, [friendData.profile]);

  const sort = useCell(settingsAtoms.anilistListSort);
  const setSort = useCallback((next: AniListSort) => {
    patchSettings({ anilistListSort: next });
  }, []);
  const groupByStatus = useCell(settingsAtoms.anilistGroupByStatus);
  const displayMode = useCell(settingsAtoms.anilistDisplayMode);
  const collapsedNames = useCell(settingsAtoms.anilistCollapsedLists);
  const setGroupByStatus = useCallback((grouped: boolean) => {
    patchSettings({ anilistGroupByStatus: grouped });
  }, []);
  const setDisplayMode = useCallback((mode: "scroll" | "pagination") => {
    patchSettings({ anilistDisplayMode: mode });
  }, []);
  const toggleListCollapsed = useCallback((name: string) => {
    const current = settingsAtoms.anilistCollapsedLists.get();
    const next = current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name];
    patchSettings({ anilistCollapsedLists: next });
  }, []);
  const [globalSort, setGlobalSort] = useState<GlobalSort>({
    key: "relevance",
    dir: "desc",
  });
  const [page, setPage] = useState<number>(1);
  const pageSize = useCell(settingsAtoms.anilistPageSize);
  const anilistSuggestionBoost = useCell(settingsAtoms.anilistSuggestionBoost);
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
    applyFilters,
    fetchNextSearchPage,
    global,
    handleClearSearch,
    handleGenre,
    handleGlobal,
    handleReset,
    handleSeason,
    handleStudio,
    handleTag,
    hasNextSearchPage,
    loadingSearch,
    loadingSearchMore,
    searchFilters,
    searchMode,
    searchResults,
    searchTag,
    searchTerms,
    setSearchTerms,
  } = useAnilistSearch();

  const {
    filter: localFilter,
    selectTag: handleDetailTag,
    selectStudio: handleDetailStudio,
    clear: clearLocalFilter,
    searchGlobally: searchLocalFilterGlobally,
  } = useAnilistLocalFilter({
    global,
    onTag: handleTag,
    onStudio: handleStudio,
  });

  const handleSelectList = useCallback(
    (name: string) => {
      setCurrentList(name);
      clearLocalFilter();
      if (global) handleReset();
    },
    [global, handleReset, clearLocalFilter]
  );

  const handleGlobalMode = useCallback(() => {
    clearLocalFilter();
    handleGlobal();
  }, [handleGlobal, clearLocalFilter]);

  const handleResetMode = useCallback(() => {
    clearLocalFilter();
    handleReset();
  }, [handleReset, clearLocalFilter]);

  useResolvedHotkeys<"tab-prev" | "tab-next">(
    [
      { id: "tab-prev", chord: "Shift+BracketLeft", repeat: "once", keybindId: "tab.prev" },
      { id: "tab-next", chord: "Shift+BracketRight", repeat: "once", keybindId: "tab.next" },
    ],
    {
      ignore: (event) => ignoreTabCycle(event),
      onAction: (id) => {
        const next = stepTabId(listIds, currentList, id === "tab-next" ? 1 : -1);
        if (next) handleSelectList(next);
      },
    }
  );

  const handleLogout = useCallback(async () => {
    syncCoverModeWithAnilistAuth(false);
    queryClient.setQueryData(queryKeys.anilistData(), {
      user: null,
      lists: [],
      favourites: [],
      people: { staff: [], characters: [] },
    });
    setCurrentList("");
    setViewedFriend(null);
    // The credential is deleted before any fallible step of the command, so a
    // failure here still leaves the session signed out; only log it.
    const [, error] = await attempt(anilistApi.logout());
    if (error) reportBackgroundError("anilist.logout", error);
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

  const source = useAnilistSource({
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
  });

  const { handleRandomFromList } = useAnilistRandom(
    source.lists,
    currentList,
    entryLookup,
    showDetail
  );
  const discovery = useRandomDiscovery();
  const { start: handleDiscoveryStart } = discovery;

  const handleFiltersClose = useCallback(() => {
    discovery.close();
    handleDetailsClose();
    handleCloseModal("filters");
  }, [discovery, handleDetailsClose, handleCloseModal]);
  const toggleFavourite = useAnilistFavouriteToggle();
  const { toggleStaff: toggleFavouriteStaff, toggleCharacter: toggleFavouriteCharacter } =
    useFavouritePeopleToggles();

  const handleDetailsSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.anilistData() });
  }, [queryClient]);

  const handleAuthSuccess = useAnilistAuth(() => handleCloseModal("auth"));

  const handleAddFriend = useCallback((profile: AniUserProfile) => {
    addAnilistFriend({
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      added_at: Date.now(),
    });
    cacheAnilistProfile(profile);
  }, []);

  const handleAddManyFriends = useCallback((minimal: AniFriendMinimal[]) => {
    for (const friend of minimal) addAnilistFriend({ ...friend, added_at: Date.now() });
  }, []);

  const openFriend = useCallback(
    (friend: AniFriend) => {
      setViewedFriend(friend);
      handleCloseModal("friends");
      setCurrentList(ALL_LISTS_ID);
      setPage(1);
      setSearchTerms("");
      clearLocalFilter();
      if (global) handleReset();
    },
    [global, handleReset, setSearchTerms, handleCloseModal, clearLocalFilter]
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
  const displayScoreFormat = useMemo(
    () =>
      resolveDisplayScoreFormat(
        source.mode,
        source.friendProfile?.score_format,
        source.user?.score_format
      ),
    [source.friendProfile, source.mode, source.user]
  );
  const viewerScoreFormat = useMemo(() => parseScoreFormat(user?.score_format), [user]);
  const { activeEntries, filteredEntries, displayEntries, isLocal, localSearchActive } =
    useAnilistEntries({
      lists: source.lists,
      currentList,
      sort,
      searchTerms,
      filterTerms: deferredSearchTerms,
      global,
      filters: searchFilters,
      localFilter,
      searchResults,
      globalSort,
    });
  const { grouped, collapsedLists, useScrollView, effectiveDisplayMode } = useAnilistListView({
    lists: source.lists,
    sort,
    searchTerms: deferredSearchTerms,
    groupByStatus,
    displayMode,
    collapsedNames,
    user,
    global,
    filters: searchFilters,
    mediaFilter: localFilter,
  });
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

  const sourceKey = `${buildAnilistSourceKey({
    currentList,
    sort,
    searchTerms: deferredSearchTerms,
    global,
    filters: searchFilters,
  })}|${JSON.stringify(localFilter)}`;
  const [lastSourceKey, setLastSourceKey] = useState<string>(sourceKey);
  if (lastSourceKey !== sourceKey) {
    setLastSourceKey(sourceKey);
    setPage(1);
  }

  useEffect(() => {
    const current = searchAtoms.anilistSearchQuery.get();
    if (current) {
      setSearchTerms(current);
      setAnilistSearchQuery(null);
    }
    let prev = searchAtoms.anilistSearchQuery.get();
    return subscribeSearch(() => {
      const cur = searchAtoms.anilistSearchQuery.get();
      if (cur && !prev) {
        setSearchTerms(cur);
        setAnilistSearchQuery(null);
      }
      prev = cur;
    });
  }, [setSearchTerms]);

  const friendState = resolveFriendState(viewedFriend, friendData.isLoading, friendData.isError);
  const headerLoading = source.mode === "friend" ? friendState === "loading" : self.isLoading;

  const detailBundle: ActivityDetailBundle = {
    entryLookup,
    scoreFormat: viewerScoreFormat,
    favouriteIds,
    favouriteStaffIds,
    favouriteCharacterIds,
    isLoggedIn: !!user,
    onFavouriteToggle: toggleFavourite,
    onStaffFavouriteToggle: toggleFavouriteStaff,
    onCharacterFavouriteToggle: toggleFavouriteCharacter,
    onTag: handleDetailTag,
    onGenre: handleGenre,
    onStudio: handleDetailStudio,
    onSeason: handleSeason,
    onSaved: handleDetailsSaved,
  };

  return (
    <div className="flex h-full w-full flex-col gap-1">
      {user && !self.isLoading && source.caps.search && (
        <AniListSearchToolbar
          field={field}
          global={global}
          onGlobal={handleGlobalMode}
          onReset={handleResetMode}
          onClearSearch={handleClearSearch}
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
        onSelectList={handleSelectList}
        searchTerms={searchTerms}
        sort={sort}
        onSortChange={setSort}
        hasFavourites={hasFavourites}
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
        filters={searchFilters}
        localFilter={localFilter}
        localFilterCount={filteredEntries.length}
        onClearLocalFilter={clearLocalFilter}
        onSearchLocalFilterGlobally={searchLocalFilterGlobally}
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
          isLocal: localSearchActive,
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
        scoreFormat={displayScoreFormat}
        onSelect={handleSelectAnime}
        scrollRef={scrollRef}
        showPagination={(!!user || global) && displayEntries.length > 0}
        pagination={{
          global,
          isLocal: localSearchActive,
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

      <GlobalSearchFooter
        global={global}
        hasNext={hasNextSearchPage}
        count={searchResults.length}
        loading={loadingSearchMore}
        onLoad={fetchNextSearchPage}
        label={t("anilist.route.load.more")}
      />

      <AniListDetailModalHost
        selectedAnime={selectedAnime}
        entryLookup={entryLookup}
        scoreFormat={viewerScoreFormat}
        favouriteIds={favouriteIds}
        favouriteStaffIds={favouriteStaffIds}
        favouriteCharacterIds={favouriteCharacterIds}
        isLoggedIn={!!user}
        onFavouriteToggle={toggleFavourite}
        onStaffFavouriteToggle={toggleFavouriteStaff}
        onCharacterFavouriteToggle={toggleFavouriteCharacter}
        onTag={handleDetailTag}
        onGenre={handleGenre}
        onStudio={handleDetailStudio}
        onSeason={handleSeason}
        onRelated={handleRelated}
        onBack={handleAnimeBack}
        onClose={handleDetailsClose}
        onSaved={handleDetailsSaved}
      />

      {views.spotlight && source.caps.modals && (
        <SpotlightModal
          hasUser={!!user}
          isFavorite={(id) => favouriteIds.has(id)}
          scoreFormat={viewerScoreFormat}
          detail={detailBundle}
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
          selfUser={user}
          scoreFormat={viewerScoreFormat}
          activityTab={views.activity.tab}
          onActivityClose={handleCloseActivity}
          activityDetail={detailBundle}
          friends={friends}
          onAddFriend={handleAddFriend}
          onAddManyFriends={handleAddManyFriends}
          onRemoveFriend={removeAnilistFriend}
          onViewFriendLists={openFriend}
          onFriendsClose={() => handleCloseModal("friends")}
          favourites={favourites}
          onFavouritesClose={() => handleCloseModal("favourites")}
          onFavouritesAnime={openAnimeFromLookup}
          people={people}
          isLoggedIn={!!user}
          favouriteStaffIds={favouriteStaffIds}
          favouriteCharacterIds={favouriteCharacterIds}
          onStaffFavouriteToggle={toggleFavouriteStaff}
          onCharacterFavouriteToggle={toggleFavouriteCharacter}
          filters={searchFilters}
          isLocalFilters={!global}
          onFiltersApply={applyFilters}
          onFiltersReset={() =>
            applyFilters(defaultAniListFilters(settingsAtoms.anilistAdultContent.get()))
          }
          onFiltersClose={handleFiltersClose}
          onFiltersRandom={handleDiscoveryStart}
          randomPending={discovery.pending}
          discovery={discovery}
          detail={detailBundle}
          onStatsClose={() => handleCloseModal("stats")}
          onBrowseClose={() => handleCloseModal("browse")}
          animeIds={allAnimeIds}
          onPrefetchClose={() => handleCloseModal("prefetch")}
        />
      )}
    </div>
  );
}

export default AnilistRoute;
