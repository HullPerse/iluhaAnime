import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Auth from "./components/anilist/auth.anilist";
import Details from "./components/anilist/details.anilist";
import type {
  AniListAnime,
  AniListCollection,
  AniListSort,
  AniMedia,
  AniRecommendation,
  AniUser,
  FavouriteAnime,
  SearchFilters,
} from "@/types/anilist";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { useSettingsStore } from "@/store/settings.store";
import { filterEntries, seasonLabels, sortEntries } from "@/lib/anilist.utils";
import { SmallLoader } from "@/components/shared/loader.component";
import FiltersModal, {
  defaultFilters,
} from "./components/anilist/filters.anilist";
import AniListActivityModal from "./components/anilist/activity.anilist";
import BrowseAnimeModal from "./components/anilist/browse.anilist";
import StatsModal from "./components/anilist/stats.anilist";
import { usePagination, paginate } from "@/hooks/pagination.hook";
import { Filter, Search, User, SearchX } from "lucide-react";

import AniListEntryCard from "./components/anilist/card.component";
import AniListProfileHeader from "./components/anilist/header.anilist";
import AniListTabs from "./components/anilist/list.anilist";
import AniListSortBar from "./components/anilist/sort.anilist";
import AniListPaginationBar from "./components/anilist/pagination.anilist";
import AniListRecsModal from "./components/anilist/rec.anilist";
import AniListFavouritesModal from "./components/anilist/favourites.anilist";

function AnilistRoute() {
  const queryClient = useQueryClient();
  const [searchTerms, setSearchTerms] = useState<string>("");
  const [currentList, setCurrentList] = useState<string>("");
  const [auth, setAuth] = useState<boolean>(false);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime>(null);
  const [animeHistory, setAnimeHistory] = useState<AniListAnime[]>([]);
  const [showRecs, setShowRecs] = useState(false);
  const [recs, setRecs] = useState<AniRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [showFavourites, setShowFavourites] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchFilters, setSearchFilters] =
    useState<SearchFilters>(defaultFilters);

  const { data: anilistData, isLoading } = useQuery({
    queryKey: ["anilist_data"],
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

  const user = anilistData?.user ?? null;
  const lists = anilistData?.lists ?? [];
  const favourites = anilistData?.favourites ?? [];

  const favouriteIds = useMemo(
    () => new Set(favourites.map((f) => f.id)),
    [favourites],
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
  const [searchMode, setSearchMode] = useState<
    "tag" | "genre" | "studio" | "season" | null
  >(null);
  const [globalSort, setGlobalSort] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({
    key: "relevance",
    dir: "desc",
  });
  const [page, setPage] = useState<number>(1);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const anilistPageSize = useSettingsStore((s) => s.anilistPageSize);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    if (lists.length > 0 && !currentList) {
      const first = lists.find((c) => c.entries.length > 0);
      if (first) setCurrentList(first.name);
    }
  }, [lists, currentList]);

  const handleGlobal = useCallback(async () => {
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    try {
      const res = await invoke<AniMedia[]>("search_anilist", {
        query: searchTerms.trim() || null,
        tags: searchFilters.tags.length > 0 ? searchFilters.tags : null,
        genres: searchFilters.genres.length > 0 ? searchFilters.genres : null,
        format: searchFilters.format || null,
        status: searchFilters.status || null,
        season: searchFilters.season || null,
        seasonYear: searchFilters.seasonYear,
        adult: searchFilters.adult || null,
        sort: searchFilters.sort ? [searchFilters.sort] : null,
        source: searchFilters.source || null,
        country: searchFilters.country || null,
        yearFrom: searchFilters.year[0] > 0 ? searchFilters.year[0] : null,
        yearTo: searchFilters.year[1] > 0 ? searchFilters.year[1] : null,
        episodesFrom:
          searchFilters.episodes[0] > 0 || searchFilters.episodes[1] > 0
            ? searchFilters.episodes[0]
            : null,
        episodesTo:
          searchFilters.episodes[0] > 0 || searchFilters.episodes[1] > 0
            ? searchFilters.episodes[1]
            : null,
        scoreFrom:
          searchFilters.score[0] > 0 || searchFilters.score[1] > 0
            ? searchFilters.score[0]
            : null,
        scoreTo:
          searchFilters.score[0] > 0 || searchFilters.score[1] > 0
            ? searchFilters.score[1]
            : null,
        maxPages: useSettingsStore.getState().anilistMaxPages,
        perPage: anilistPageSize,
      });
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  }, [searchTerms, searchFilters, anilistPageSize]);

  const handleSeason = useCallback(
    async (season: string, seasonYear: number | null) => {
      setGlobal(true);
      setLoadingSearch(true);
      setSearchResults([]);
      setSearchTerms("");
      setSearchTag(
        `${seasonLabels[season] ?? season}${seasonYear ? ` ${seasonYear}` : ""}`,
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
          seasonYear: seasonYear,
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
    [anilistPageSize],
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
  }, []);

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

  const entryLookup = useMemo(() => {
    const map = new Map<
      number,
      { progress: number | null; score: number | null; list_status: string }
    >();
    for (const list of lists) {
      for (const e of list.entries) {
        map.set(e.media.id, {
          progress: e.progress,
          score: e.score,
          list_status: e.list_status,
        });
      }
    }
    return map;
  }, [lists]);

  const activeEntries =
    lists.find((c) => c.name === currentList)?.entries ?? [];
  const filteredEntries = filterEntries(activeEntries, searchTerms, global);
  const sortedEntries = sortEntries(filteredEntries, sort.dir, sort.key);
  const displayEntries = global
    ? [...searchResults].sort((a, b) => {
        const k = globalSort.key;
        if (k === "relevance") return 0;
        let cmp = 0;
        if (k === "title") cmp = a.title.localeCompare(b.title);
        else if (k === "score") cmp = (a.score ?? 0) - (b.score ?? 0);
        else if (k === "year")
          cmp = (a.season_year ?? 0) - (b.season_year ?? 0);
        return globalSort.dir === "asc" ? cmp : -cmp;
      })
    : sortedEntries.map((e) => e.media);

  const isLocal = !!searchTerms.trim() && !global;

  const { total, from, to, lastPage } = usePagination(
    displayEntries.length,
    anilistPageSize,
    page,
    setPage,
  );

  const pagedEntries = useMemo(
    () => paginate(displayEntries, page, anilistPageSize),
    [displayEntries, page, anilistPageSize],
  );

  useEffect(() => {
    setPage((p) => Math.min(p, lastPage));
  }, [lastPage]);

  return (
    <main className="flex flex-col w-full h-full gap-1">
      <section className="flex flex-row gap-2 w-full">
        <Input
          placeholder="Найти аниме..."
          value={searchTerms}
          className="h-9 font-bold bg-white"
          autoFocus
          onChange={(e) => {
            setSearchTerms(e.target.value);
            if (global && !e.target.value.trim()) handleReset();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleGlobal();
          }}
        />
        <Button
          size="icon"
          title="Фильтры"
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
            <span className="absolute -top-1 -right-1 size-3 text-[8px] bg-secondary text-white flex items-center justify-center">
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
          title={global ? "Вернуться к профилю" : "Поиск"}
          onClick={() => (global ? handleReset() : handleGlobal())}
          disabled={loadingSearch}
        >
          {global ? <User className="size-4" /> : <Search className="size-4" />}
        </Button>
      </section>

      {user && !global && !isLocal && (
        <AniListProfileHeader
          user={user}
          loadingList={isLoading}
          onStatsOpen={() => setShowStats(true)}
          onBrowseOpen={() => setShowBrowse(true)}
          onRecsOpen={() => setShowRecs(true)}
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
        />
      )}

      {user && !global && lists.length > 0 && (
        <AniListSortBar
          sort={sort}
          onSortChange={setSort}
          onActivityOpen={() => setShowActivity(true)}
          onFavouritesOpen={() => setShowFavourites(true)}
          onRandom={handleRandomFromList}
          hasFavourites={favourites.length > 0}
        />
      )}

      {global && searchResults.length > 0 && (
        <section className="windows95-border bg-primary px-1 py-0.5 flex flex-row items-center gap-2">
          <span className="windows95-text text-[10px] text-muted">
            Сортировка:
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
                  ? "Релевантность"
                  : s === "title"
                    ? "Название"
                    : s === "score"
                      ? "Рейтинг"
                      : "Год"}
              </Button>
            );
          })}
        </section>
      )}

      {isLoading && lists.length === 0 && (
        <section className="flex items-center justify-center flex-1">
          <SmallLoader />
        </section>
      )}

      {pagedEntries.length === 0 &&
        !global &&
        !isLocal &&
        !user &&
        !isLoading && (
          <section className="flex flex-col items-center justify-center flex-1 gap-2">
            <User className="size-8 text-muted" />
            <span className="windows95-text">Войдите в профиль</span>
            <Button onClick={() => setAuth(true)}>Войти</Button>
          </section>
        )}

      {pagedEntries.length === 0 && isLocal && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <SearchX className="size-8 text-muted" />
          <span className="windows95-text">Ничего не найдено в списке</span>
        </section>
      )}

      {loadingSearch && global && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <SmallLoader />
        </section>
      )}

      {!searchResults.length && global && !loadingSearch && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <SearchX className="size-8 text-muted" />
          <span className="windows95-text">Ничего не найдено на AniList</span>
        </section>
      )}

      {pagedEntries.length > 0 && (
        <section
          className="flex flex-col w-full h-full overflow-y-auto p-1 gap-1 border windows95-border"
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
        <AniListPaginationBar
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          statusText={
            global
              ? `Поиск: ${searchResults.length} результатов${searchTag ? ` · ${searchMode === "studio" ? "студия" : searchMode === "season" ? "сезон" : "тег"}: ${searchTag}` : ""}`
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
                { animeId },
              );
              queryClient.setQueryData(["anilist_data"], (old: any) =>
                old ? { ...old, favourites: updated } : old,
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
          onBack={animeHistory.length > 0 ? () => {
            const prev = animeHistory[animeHistory.length - 1];
            if (prev) {
              setAnimeHistory((h) => h.slice(0, -1));
              setSelectedAnime(prev);
            }
          } : undefined}
          onClose={() => { setSelectedAnime(null); setAnimeHistory([]); }}
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

      {user && showActivity && (
        <AniListActivityModal
          userId={user.id}
          onClose={() => setShowActivity(false)}
          onAnimeClick={(id) => {
            setShowActivity(false);
            setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) });
          }}
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
    </main>
  );
}

export default AnilistRoute;
