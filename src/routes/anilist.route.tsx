import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { useAnilistDetail } from "@/hooks/anilist/detail.hook";
import { useRandomDiscovery } from "@/hooks/anilist/discovery.hook";
import { useAnilistListView } from "@/hooks/anilist/listView.hook";
import { useAnilistModals } from "@/hooks/anilist/modals.hook";
import { useFavouritePeopleToggles } from "@/hooks/anilist/people.hook";
import { useAnilistRandom } from "@/hooks/anilist/random.hook";
import { useAnilistSearch, useProfileRecs } from "@/hooks/anilist/search.hook";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagination } from "@/hooks/pagination.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { filterEntries, sortEntries } from "@/lib/entries.utils";
import { defaultAniListFilters } from "@/lib/anilistFilters.utils";
import { ALL_LISTS_ID, activeListEntries } from "@/lib/anilistGroup.utils";
import {
  buildAnilistSourceKey,
  pickDisplayEntries,
  hasAnyFavourites,
  isLocalSearch,
  resolveAniListView,
  routePeople,
} from "@/lib/anilistRoute.utils";
import { parseScoreFormat, resolveDisplayScoreFormat } from "@/lib/anilistScore.utils";
import { focusMainSearch } from "@/lib/focusHotkeys.utils";
import { ignoreTabCycle, stepTabId } from "@/lib/tabsHotkeys.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { queryKeys } from "@/lib/keys.utils";
import { useCell } from "@/lib/signal.hook";
import { attempt, reportBackgroundError } from "@/lib/attempt.utils";
import { showErrorOnce } from "@/lib/notification.utils";
import { paginate } from "@/lib/pagination.utils";
import {
  addAnilistFriend,
  anilistFriendsAtoms,
  cacheAnilistProfile,
  removeAnilistFriend,
} from "@/store/anilist.store";
import { consumeAuthDeepLink, deeplinkAtoms } from "@/store/deeplink.store";
import { addNotification } from "@/store/notification.store";
import { searchAtoms, setAnilistSearchQuery, subscribeSearch } from "@/store/search.store";
import { patchSettings, settingsAtoms, syncCoverModeWithAnilistAuth } from "@/store/settings.store";
import type {
  ActivityDetailBundle,
  AniFriend,
  AniFriendMinimal,
  AniListAnime,
  AniListSort,
  AniUser,
  AniUserProfile,
  AnilistRouteData,
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

function GlobalSearchFooter({
  global,
  hasNext,
  count,
  loading,
  onLoad,
  label,
}: {
  global: boolean;
  hasNext: boolean;
  count: number;
  loading: boolean;
  onLoad: () => void;
  label: string;
}) {
  if (!global || !hasNext || count === 0) return null;
  return (
    <Button onClick={onLoad} disabled={loading}>
      {loading ? `${label}...` : label}
    </Button>
  );
}

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

  const favouriteIds = useMemo(() => new Set(favourites.map((f) => f.id)), [favourites]);

  const people = routePeople(self.data);
  const favouriteStaffIds = useMemo(() => new Set(people.staff.map((p) => p.id)), [people]);
  const favouriteCharacterIds = useMemo(
    () => new Set(people.characters.map((p) => p.id)),
    [people]
  );
  const friends = useCell(anilistFriendsAtoms.friends);
  const friendIds = useMemo(() => [...new Set(friends.map((friend) => friend.id))], [friends]);

  useEffect(() => {
    if (friendData.profile) cacheAnilistProfile(friendData.profile);
  }, [friendData.profile]);

  const allAnimeIds = useMemo(
    () => lists.flatMap((l) => l.entries.map((e) => e.media.id)),
    [lists]
  );

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
  const pageSize = useCell(settingsAtoms.pageSize);
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

  const handleSelectList = useCallback(
    (name: string) => {
      setCurrentList(name);
      if (global) handleReset();
    },
    [global, handleReset]
  );

  useResolvedHotkeys<"tab-prev" | "tab-next">(
    [
      { id: "tab-prev", chord: "Shift+BracketLeft", repeat: "once", keybindId: "tab.prev" },
      { id: "tab-next", chord: "Shift+BracketRight", repeat: "once", keybindId: "tab.next" },
    ],
    {
      ignore: (event) => ignoreTabCycle(event),
      onAction: (id) => {
        const ids = [
          ALL_LISTS_ID,
          ...lists.filter((item) => item.entries.length > 0).map((item) => item.name),
        ];
        const next = stepTabId(ids, currentList, id === "tab-next" ? 1 : -1);
        if (next) handleSelectList(next);
      },
    }
  );

  const handleLogout = useCallback(async () => {
    await anilistApi.logout();
    syncCoverModeWithAnilistAuth(false);
    queryClient.setQueryData(queryKeys.anilistData(), {
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
  const favPendingRef = useRef<Set<number>>(new Set());
  const toggleFavourite = useCallback(
    async (animeId: number) => {
      if (favPendingRef.current.has(animeId)) return;
      favPendingRef.current.add(animeId);
      const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
      const wasFavourite = previous?.favourites.some((f) => f.id === animeId) ?? false;
      if (wasFavourite) {
        queryClient.setQueryData(queryKeys.anilistData(), (old: unknown) =>
          old
            ? {
                ...(old as AnilistRouteData),
                favourites: (old as AnilistRouteData).favourites.filter((f) => f.id !== animeId),
              }
            : old
        );
      }
      const [updated, error] = await attempt(anilistApi.toggleFavourite(animeId));
      favPendingRef.current.delete(animeId);
      if (error) {
        if (wasFavourite) {
          queryClient.setQueryData(queryKeys.anilistData(), previous);
        }
        addNotification(tr("anilist.fav.toggle.failed"), "error", error.message);
      } else {
        queryClient.setQueryData(queryKeys.anilistData(), (old: unknown) =>
          old ? { ...(old as AnilistRouteData), favourites: updated } : old
        );
      }
    },
    [queryClient]
  );
  const { toggleStaff: toggleFavouriteStaff, toggleCharacter: toggleFavouriteCharacter } =
    useFavouritePeopleToggles();

  const handleDetailsSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.anilistData() });
  }, [queryClient]);

  const handleAuthSuccess = useCallback(
    (authUser: AniUser) => {
      handleCloseModal("auth");
      syncCoverModeWithAnilistAuth(true);
      queryClient.setQueryData(queryKeys.anilistData(), {
        user: authUser,
        lists: [],
        favourites: [],
        people: { staff: [], characters: [] },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.anilistData() });
    },
    [queryClient, handleCloseModal]
  );

  const authTarget = useCell(deeplinkAtoms.authTarget);
  useEffect(() => {
    if (!authTarget) return;
    consumeAuthDeepLink();
    (async () => {
      const [authUser, error] = await attempt(anilistApi.login(authTarget.accessToken));
      if (error) {
        addNotification(tr("anilist.auth.failed"), "error", error.message);
        return;
      }
      handleAuthSuccess(authUser);
    })();
  }, [authTarget, handleAuthSuccess]);

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
  const activeEntries = useMemo(
    () => activeListEntries(source.lists, currentList),
    [source.lists, currentList]
  );
  const filteredEntries = useMemo(
    () => filterEntries(activeEntries, deferredSearchTerms, global, searchFilters),
    [activeEntries, deferredSearchTerms, global, searchFilters]
  );
  const sortedEntries = useMemo(
    () => sortEntries(filteredEntries, sort.dir, sort.key),
    [filteredEntries, sort.dir, sort.key]
  );
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

  const sourceKey = buildAnilistSourceKey({
    currentList,
    sort,
    searchTerms: deferredSearchTerms,
    global,
    filters: searchFilters,
  });
  const [lastSourceKey, setLastSourceKey] = useState(sourceKey);
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

  const friendState: "loading" | "error" | null = viewedFriend
    ? friendData.isLoading
      ? "loading"
      : friendData.isError
        ? "error"
        : null
    : null;
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
    onTag: handleTag,
    onGenre: handleGenre,
    onStudio: handleStudio,
    onSeason: handleSeason,
    onSaved: handleDetailsSaved,
  };

  return (
    <div className="flex h-full w-full flex-col gap-1">
      {user && !self.isLoading && source.caps.search && (
        <AniListSearchToolbar
          field={field}
          global={global}
          onGlobal={handleGlobal}
          onReset={handleReset}
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
        hasFavourites={hasAnyFavourites(favourites, people)}
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
        scoreFormat={displayScoreFormat}
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
