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
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
import { paginate } from "@/lib/pagination.utils";
import {
  getInlineCompletion,
  getSearchSuggestions,
} from "@/lib/search.suggestions";
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

  const activeEntries =
    lists.find((c) => c.name === currentList)?.entries ?? [];
  const filteredEntries = filterEntries(activeEntries, searchTerms, global);
  const sortedEntries = sortEntries(filteredEntries, sort.dir, sort.key);
  const displayEntries = global
    ? sortAniMediaList(searchResults, globalSort.key, globalSort.dir)
    : sortedEntries.map((e) => e.media);

  const isLocal = !!searchTerms.trim() && !global;
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
              setSearchTerms(e.target.value);
              if (global && !e.target.value.trim()) handleReset();
            }}
            onAcceptCompletion={(value) => {
              recordSuggestion(value);
              setSearchTerms(value);
            }}
            onDismissCompletion={() => {
              if (inlineCompletion) recordSuggestionIgnored(inlineCompletion);
            }}
            onKeyDown={enterSubmit(() => {
              if (
                inlineCompletion &&
                searchTerms.trim().toLocaleLowerCase() !==
                  inlineCompletion.toLocaleLowerCase()
              ) {
                recordSuggestionIgnored(inlineCompletion);
              }
              handleGlobal();
            })}
          />
          <Button
            size="icon"
            title={t("anilist.route.filters")}
            onClick={() => setShowFilters(true)}
            className="relative"
          >
            <Filter className="size-4" />
            {searchFilters.tags.length +
              (searchFilters.format ? 1 : 0) +
              (searchFilters.status ? 1 : 0) +
              (searchFilters.season ? 1 : 0) +
              (searchFilters.adult ? 1 : 0) >
              0 && (
              <span className="bg-secondary absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs text-white">
                {searchFilters.tags.length +
                  (searchFilters.format ? 1 : 0) +
                  (searchFilters.status ? 1 : 0) +
                  (searchFilters.season ? 1 : 0) +
                  (searchFilters.adult ? 1 : 0)}
              </span>
            )}
          </Button>
          <Button
            size="icon"
            title={global ? t("anilist.route.backToProfile") : t("app.search")}
            onClick={() => (global ? handleReset() : handleGlobal())}
            disabled={loadingSearch}
          >
            {global ? (
              <User className="size-4" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
        </section>
      )}

      {user && !global && !isLocal && (
        <AniListProfileHeader
          user={user}
          loadingList={isLoading}
          onStatsOpen={() => setShowStats(true)}
          onBrowseOpen={() => setShowBrowse(true)}
          onRecsOpen={() => setShowRecs(true)}
          onPrefetchOpen={() => setShowPrefetch(true)}
          onFriendsOpen={() => setShowFriends(true)}
          onLogout={handleLogout}
        />
      )}

      {!isLoading && user && lists.length > 0 && !global && (
        <AniListTabs
          lists={lists}
          currentList={currentList}
          onSelect={(name) => {
            setCurrentList(name);
            if (global) handleReset();
          }}
          searchTerms={searchTerms}
          global={global}
        />
      )}

      {user && !global && lists.length > 0 && (
        <AniListSortBar
          sort={sort}
          onSortChange={setSort}
          onActivityOpen={() => setActivityHistory({ open: true, tab: "feed" })}
          onFavouritesOpen={() => setShowFavourites(true)}
          onRandom={handleRandomFromList}
          onHistoryOpen={() =>
            setActivityHistory({ open: true, tab: "calendar" })
          }
          hasFavourites={favourites.length > 0}
        />
      )}

      {global && searchResults.length > 0 && (
        <section className="windows95-border bg-primary flex flex-row items-center gap-2 px-1 py-0.5">
          <span className="windows95-text text-muted text-xs">
            {t("anilist.route.sorting")}
          </span>
          {(["relevance", "title", "score", "year"] as const).map((s) => {
            const isActive = globalSort.key === s;
            const isRelevance = s === "relevance";
            return (
              <Button
                key={s}
                variant={isActive ? "outline" : "default"}
                size="default"
                className="px-2 py-0.5"
                onClick={() => {
                  if (isRelevance)
                    setGlobalSort({ key: "relevance", dir: "desc" });
                  else
                    setGlobalSort((prev) => ({
                      key: s,
                      dir: isActive
                        ? prev.dir === "asc"
                          ? "desc"
                          : "asc"
                        : prev.dir,
                    }));
                }}
              >
                {isRelevance
                  ? t("anilist.route.sortRelevance")
                  : s === "title"
                    ? t("anilist.route.sortTitle")
                    : s === "score"
                      ? t("anilist.route.sortScore")
                      : t("anilist.route.sortYear")}
              </Button>
            );
          })}
        </section>
      )}

      {isLoading && lists.length === 0 && (
        <section className="flex flex-1 items-center justify-center">
          <SmallLoader />
        </section>
      )}

      {pagedEntries.length === 0 &&
        !global &&
        !isLocal &&
        !user &&
        !isLoading && (
          <section className="flex flex-1 flex-col items-center justify-center gap-2">
            <User className="text-muted size-8" />
            <span className="windows95-text">
              {t("anilist.route.loginPrompt")}
            </span>
            <Button onClick={() => setAuth(true)}>
              {t("anilist.route.login")}
            </Button>
          </section>
        )}

      {pagedEntries.length === 0 && isLocal && (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <SearchX className="text-muted size-8" />
          <span className="windows95-text">{t("anilist.route.emptyList")}</span>
        </section>
      )}

      {loadingSearch && global && (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <SmallLoader />
        </section>
      )}

      {!searchResults.length && global && !loadingSearch && (
        <section className="flex flex-1 flex-col items-center justify-center gap-2">
          <SearchX className="text-muted size-8" />
          <span className="windows95-text">
            {t("anilist.route.emptyAnilist")}
          </span>
        </section>
      )}

      {pagedEntries.length > 0 && (
        <section
          className="windows95-border flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto border bg-white p-1"
          ref={scrollRef}
        >
          {pagedEntries.map((item) => (
            <AniListEntryCard
              key={item.id}
              item={item}
              entryLookup={entryLookup}
              onClick={(anime) => setSelectedAnime(anime)}
            />
          ))}
        </section>
      )}

      {(user || global) && displayEntries.length > 0 && (
        <Pagination
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          statusText={
            global
              ? `${t("anilist.route.searchResults", { count: searchResults.length })}${searchTag ? ` · ${searchMode === "studio" ? t("anilist.route.studio") : searchMode === "season" ? t("anilist.route.season") : t("anilist.route.tag")}: ${searchTag}` : ""}`
              : isLocal
                ? `${currentList}: ${filteredEntries.length} / ${activeEntries.length}`
                : user
                  ? `${currentList}: ${activeEntries.length}`
                  : undefined
          }
        />
      )}

      {auth && (
        <Auth
          onAuth={(user) => {
            setAuth(false);
            queryClient.setQueryData(["anilist_data"], {
              user,
              lists: [],
              favourites: [],
            });
            queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
          }}
          onClose={() => setAuth(false)}
        />
      )}

      {selectedAnime && (
        <Details
          animeId={selectedAnime.animeId}
          listEntry={selectedAnime.listEntry}
          isLoggedIn={!!user}
          favouriteIds={favouriteIds}
          onFavouriteToggle={async (animeId) => {
            try {
              const updated = await invoke<FavouriteAnime[]>(
                "toggle_favourite",
                { animeId }
              );
              queryClient.setQueryData(["anilist_data"], (old: any) =>
                old ? { ...old, favourites: updated } : old
              );
            } catch {}
          }}
          onTag={handleTag}
          onGenre={handleGenre}
          onStudio={handleStudio}
          onSeason={handleSeason}
          onRelated={(id) => {
            setAnimeHistory((prev) => [...prev, selectedAnime]);
            setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
          }}
          onBack={
            animeHistory.length > 0
              ? () => {
                  const prev = animeHistory.at(-1);
                  if (prev) {
                    setAnimeHistory((h) => h.slice(0, -1));
                    setSelectedAnime(prev);
                  }
                }
              : undefined
          }
          onClose={() => {
            setSelectedAnime(null);
            setAnimeHistory([]);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["anilist_data"] });
          }}
        />
      )}

      <AniListRecsModal
        open={showRecs}
        loading={recsLoading}
        recommendations={recs}
        onClose={() => setShowRecs(false)}
        onAnimeClick={(id) => {
          setShowRecs(false);
          setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
        }}
      />

      {user && activityHistory.open && (
        <ActivityHistoryModal
          userId={user.id}
          friendIds={friendIds}
          lists={lists}
          initialTab={activityHistory.tab}
          onClose={() => setActivityHistory((s) => ({ ...s, open: false }))}
          onAnimeClick={(id) => {
            setActivityHistory((s) => ({ ...s, open: false }));
            setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
          }}
        />
      )}

      {user && showFriends && (
        <AniListFriendsModal
          friends={friends}
          onAdd={(profile) => {
            addFriend({
              id: profile.id,
              name: profile.name,
              avatar: profile.avatar,
            });
            cacheFriendProfile(profile);
          }}
          onRemove={removeFriend}
          onClose={() => setShowFriends(false)}
        />
      )}

      <AniListFavouritesModal
        open={showFavourites}
        favourites={favourites}
        onClose={() => setShowFavourites(false)}
        onAnimeClick={(id) => {
          setShowFavourites(false);
          setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
        }}
      />

      <FiltersModal
        open={showFilters}
        filters={searchFilters}
        onApply={setSearchFilters}
        onReset={() => setSearchFilters(defaultFilters)}
        onClose={() => setShowFilters(false)}
      />

      {showStats && (
        <StatsModal
          lists={lists}
          onClose={() => setShowStats(false)}
          onAnimeClick={(id) => {
            setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
          }}
        />
      )}

      {showBrowse && (
        <BrowseAnimeModal
          entries={entryLookup}
          onClose={() => setShowBrowse(false)}
          onAnimeClick={(id) => {
            setShowBrowse(false);
            setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
          }}
        />
      )}

      {showPrefetch && (
        <PrefetchRelationsModal
          animeIds={allAnimeIds}
          onClose={() => setShowPrefetch(false)}
        />
      )}
    </main>
  );
}

export default AnilistRoute;
