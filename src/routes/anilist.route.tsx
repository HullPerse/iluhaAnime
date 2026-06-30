import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Auth from "./components/anilist/auth.anilist";
import Details from "./components/anilist/details.anilist";
import Modal from "@/components/shared/modal.component";
import type {
  AniListAnime,
  AniListCollection,
  AniListSort,
  AniMedia,
  AniRecommendation,
  AniUser,
} from "@/types/anilist";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { useSettingsStore } from "@/store/settings.store";
import {
  filterEntries,
  getSortingLabel,
  getListLabel,
  getStatusLabel,
  sortEntries,
  getStatusColor,
} from "@/lib/anilist.utils";
import { SmallLoader } from "@/components/shared/loader.component";
import {
  ArrowLeft,
  ArrowRight,
  Dices,
  Loader,
  LogOut,
  Search,
  SearchX,
  Star,
  User,
} from "lucide-react";

function AnilistRoute() {
  const [searchTerms, setSearchTerms] = useState<string>("");
  const [user, setUser] = useState<AniUser | null>(null);
  const [lists, setLists] = useState<AniListCollection[]>([]);
  const [currentList, setCurrentList] = useState<string>("");
  const [auth, setAuth] = useState<boolean>(false);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime>(null);
  const [showRecs, setShowRecs] = useState(false);
  const [recs, setRecs] = useState<AniRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

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
  const [sort, setSort] = useState<AniListSort>({
    key: "title",
    dir: "asc",
  });
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<AniMedia[]>([]);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<"tag" | "studio" | null>(null);
  const [globalSort, setGlobalSort] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "relevance", dir: "desc" });
  const [page, setPage] = useState<number>(1);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const anilistPageSize = useSettingsStore((s) => s.anilistPageSize);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [page]);

  const handleGlobal = useCallback(async () => {
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    try {
      const res = await invoke<AniMedia[]>("search_anilist", {
        query: searchTerms.trim(),
      });
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  }, [searchTerms]);

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

  const handleReset = useCallback(() => {
    setSearchTerms("");
    setGlobal(false);
    setSearchResults([]);
    setSearchTag(null);
    setSearchMode(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await invoke("anilist_logout");

    setUser(null);
    setLists([]);
    setCurrentList("");
  }, []);

  const handleRandomPlanned = useCallback(() => {
    const planning = lists.find((l) => l.name.toUpperCase() === "PLANNING");
    if (!planning?.entries.length) return;
    const idx = Math.floor(Math.random() * planning.entries.length);
    const entry = planning.entries[idx];
    setSelectedAnime({
      animeId: entry.media.id,
      listEntry: {
        progress: entry.progress,
        score: entry.score,
        list_status: entry.list_status,
      },
    });
  }, [lists]);

  useEffect(() => {
    setLoadingList(true);
    invoke<AniUser | null>("check_anilist_auth")
      .then((user) => {
        if (user) {
          setUser(user);
          invoke<AniListCollection[]>("get_anilist_lists", { userId: user.id })
            .then((l) => {
              setLists(l);
              const first = l.find((c) => c.entries.length > 0);
              if (first) setCurrentList(first.name);
            })
            .finally(() => setLoadingList(false))
            .catch(() => setLoadingList(false));
        }
      })
      .catch(() => setLoadingList(false));
  }, []);

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

  const total = displayEntries.length;
  const from = total === 0 ? 0 : (page - 1) * anilistPageSize + 1;
  const to = Math.min(page * anilistPageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / anilistPageSize));

  const pagedEntries = useMemo(() => {
    const start = (page - 1) * anilistPageSize;
    return displayEntries.slice(start, start + anilistPageSize);
  }, [displayEntries, page, anilistPageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, lastPage));
  }, [lastPage]);

  return (
    <main className="flex flex-col w-full h-full gap-1">
      {/*TOP*/}
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
            if (e.key === "Enter" && searchTerms.trim()) {
              handleGlobal();
            }
          }}
        />
        <Button
          size="icon"
          title={global ? "Вернуться к профилю" : "Поиск"}
          onClick={() => {
            if (global) return handleReset();
            else return handleGlobal();
          }}
          disabled={global ? false : loadingSearch || !searchTerms.trim()}
        >
          {global ? <User className="size-4" /> : <Search className="size-4" />}
        </Button>
      </section>

      {/* PROFILE */}
      {user && !global && !isLocal && (
        <section className="flex flex-row items-center gap-2 windows95-active-border bg-primary p-1 w-full">
          {user.avatar && (
            <img
              src={user.avatar}
              alt=""
              className="h-10 windows95-active-border"
            />
          )}

          <div className="flex flex-col">
            <span className="windows95-text font-bold">
              {user.name.toUpperCase()}
            </span>
            <span className="windows95-text text-[10px]">
              {loadingList ? (
                "..."
              ) : (
                <>
                  {user.anime_count} аниме · {user.episodes_watched} эп.
                  {user.mean_score != null && <> · ср. {user.mean_score}</>}
                </>
              )}
            </span>
          </div>

          <Button
            size="default"
            className="ml-auto h-7 text-[10px]"
            onClick={() => setShowRecs(true)}
          >
            Рекомендации
          </Button>

          <Button size="icon" variant="error" onClick={handleLogout}>
            <LogOut />
          </Button>
        </section>
      )}

      {/* TABS */}
      {!loadingList && user && lists.length > 0 && !global && (
        <section className="relative flex flex-row gap-1">
          {lists
            .filter((item) => item.entries.length > 0)
            .map((item) => {
              const isActive = currentList === item.name;

              return (
                <Button
                  key={item.name}
                  className={`px-3 py-0.5 cursor-pointer windows95-text active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text ${
                    isActive
                      ? "windows95-active-border border-b-transparent"
                      : "windows95-border bg-surface"
                  }`}
                  style={{
                    top: isActive ? 0 : "2px",
                    marginBottom: isActive ? "-2px" : undefined,
                    zIndex: isActive ? 20 : 10,
                  }}
                  onClick={() => {
                    setCurrentList(item.name);
                    if (global) handleReset();
                  }}
                  disabled={isActive}
                >
                  {getListLabel(item.name.toUpperCase()) ?? item.name} (
                  {item.entries.length})
                </Button>
              );
            })}
        </section>
      )}

      {/* SORT TOOLBAR */}
      {user && !global && lists.length > 0 && (
        <section className="windows95-border bg-white px-1 py-0.5 flex flex-row items-center gap-2">
          <span className="windows95-text text-[10px] text-muted">
            Сортировка:
          </span>
          {(["title", "score", "progress"] as AniListSort["key"][]).map((s) => {
            const isActive = sort.key === s;

            return (
              <Button
                key={s}
                variant={isActive ? "outline" : "default"}
                size="default"
                className="px-2 py-0.5"
                onClick={() => {
                  setSort((prev) => ({
                    key: s,
                    dir: isActive
                      ? prev.dir === "asc"
                        ? "desc"
                        : "asc"
                      : prev.dir,
                  }));
                }}
              >
                {getSortingLabel(s, sort.dir)}
              </Button>
            );
          })}

          <span className="w-px h-5 bg-muted mx-1" />

          <Button
            size="icon"
            className="h-6 w-6 ml-auto"
            title="Случайное из запланированного"
            onClick={handleRandomPlanned}
          >
            <Dices className="size-3.5" />
          </Button>
        </section>
      )}

      {/* GLOBAL SORT TOOLBAR */}
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
                  if (isRelevance) {
                    setGlobalSort({ key: "relevance", dir: "desc" });
                  } else {
                    setGlobalSort((prev) => ({
                      key: s,
                      dir: isActive
                        ? prev.dir === "asc"
                          ? "desc"
                          : "asc"
                        : prev.dir,
                    }));
                  }
                }}
              >
                {isRelevance
                  ? "Релевантность"
                  : getSortingLabel(s, globalSort.dir)}
              </Button>
            );
          })}
        </section>
      )}

      {/* LOADING */}
      {loadingList && lists.length === 0 && (
        <section className="flex items-center justify-center flex-1">
          <SmallLoader />
        </section>
      )}

      {/* CONTENT */}
      {pagedEntries.length === 0 &&
        !global &&
        !isLocal &&
        !user &&
        !loadingList && (
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
          {pagedEntries.map((item) => {
            const entry = entryLookup.get(item.id);

            return (
              <div
                key={item.id}
                className="flex flex-row windows95-active-border bg-primary p-2 hover:bg-surface hover:cursor-pointer min-h-28 max-h-36"
                onClick={() =>
                  setSelectedAnime({
                    animeId: item.id,
                    ...(entry && {
                      listEntry: {
                        progress: entry.progress,
                        score: entry.score,
                        list_status: entry.list_status,
                      },
                    }),
                  })
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
              >
                <main className="flex flex-row w-full items-start justify-between gap-2">
                  <section className="min-w-0 flex-1 h-full flex flex-col">
                    {/*top*/}
                    <div className="flex flex-row gap-2">
                      <h2
                        className="flex flex-row gap-1 truncate font-bold leading-tight windows95-text"
                        title={item.title}
                      >
                        {entry && (
                          <span
                            className="windows95-border shrink-0 mt-0.5"
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              backgroundColor: getStatusColor(
                                entry.list_status,
                              ),
                            }}
                            title={
                              getListLabel(entry.list_status) ??
                              entry.list_status
                            }
                          />
                        )}
                        {item.title}
                      </h2>
                    </div>

                    {/*bottom*/}
                    <div className="flex flex-row gap-2 items-center mt-auto windows95-text font-bold">
                      {item.score && (
                        <span className="px-1 bg-secondary text-primary text-[10px]">
                          ★ {item.score}
                        </span>
                      )}
                      <span className="text-[10px] text-text">
                        {getStatusLabel(item.status.toUpperCase()) ??
                          item.status}
                      </span>
                      {entry != null &&
                        entry.progress != null &&
                        item.episodes && (
                          <div className="flex items-center gap-1">
                            <div className="windows95-small-border w-20 h-3.5 bg-white relative overflow-hidden">
                              <div
                                className="h-full bg-secondary"
                                style={{
                                  width: `${Math.min(100, Math.round((entry.progress / item.episodes) * 100))}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] windows95-text">
                              {entry.progress}/{item.episodes}
                            </span>
                          </div>
                        )}
                      {entry != null &&
                        entry.progress != null &&
                        !item.episodes && (
                          <span className="px-1 bg-secondary text-white text-[10px]">
                            {entry.progress}
                          </span>
                        )}
                      {!entry && item.episodes && (
                        <span className="text-[10px] text-text">
                          {item.episodes} эп.
                        </span>
                      )}
                    </div>
                  </section>

                  {item.cover_url && (
                    <img
                      src={item.cover_url}
                      alt={item.title + " cover"}
                      className="w-14 windows95-active-border shrink-0"
                    />
                  )}
                </main>
              </div>
            );
          })}
        </section>
      )}

      {/* STATUS BAR */}
      {(user || global) && (
        <section className="windows95-border bg-primary px-1 py-0.5 flex flex-row items-center justify-between">
          <span className="windows95-text">
            {global ? (
              <>
                Поиск: {searchResults.length} результатов
                {searchTag && (
                  <>
                    {" "}
                    · {searchMode === "studio" ? "студия" : "тег"}: {searchTag}
                  </>
                )}
              </>
            ) : isLocal ? (
              <>
                {`${getListLabel(currentList.toUpperCase()) ?? currentList}: ${filteredEntries.length} / ${activeEntries.length}`}
              </>
            ) : user ? (
              <>
                {`${getListLabel(currentList.toUpperCase()) ?? currentList}: ${activeEntries.length}`}
              </>
            ) : null}
          </span>
          <span className="windows95-text">
            {displayEntries.length > 0 &&
              `Показано: ${from}...${to} / ${displayEntries.length}`}
          </span>
          <div className="windows95-text flex flex-row gap-1 items-center">
            <Button
              size="icon"
              className="h-6 w-6"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ArrowLeft />
            </Button>
            <Input
              value={page}
              onChange={(e) => {
                const number = Number(e.target.value);
                if (!Number.isFinite(number) || number < 1) return;
                setPage(number);
              }}
              min={1}
              max={lastPage}
              type="number"
              inputMode="numeric"
              className="windows95-text font-bold windows95-border h-6 w-10 text-center flex items-center justify-center"
            />
            <Button
              size="icon"
              className="h-6 w-6"
              onClick={() => setPage(page + 1)}
              disabled={page === lastPage}
            >
              <ArrowRight />
            </Button>
          </div>
        </section>
      )}

      {/* MODAL */}
      {auth && (
        <Auth
          onAuth={(user) => {
            setUser(user);
            setAuth(false);
            invoke<AniListCollection[]>("get_anilist_lists", {
              userId: user.id,
            }).then((res) => {
              setLists(res);
              const first = res.find((i) => i.entries.length > 0);
              if (first) setCurrentList(first.name);
            });
          }}
          onClose={() => setAuth(false)}
        />
      )}

      {selectedAnime && (
        <Details
          animeId={selectedAnime.animeId}
          listEntry={selectedAnime.listEntry}
          isLoggedIn={!!user}
          onTag={handleTag}
          onStudio={handleStudio}
          onRelated={(id) =>
            setSelectedAnime({ animeId: id, listEntry: entryLookup.get(id) })
          }
          onClose={() => setSelectedAnime(null)}
          onSaved={() => {
            if (!user) return;
            invoke<AniListCollection[]>("get_anilist_lists", {
              userId: user.id,
            }).then((res) => setLists(res));
          }}
        />
      )}

      {showRecs && (
        <Modal
          header="Рекомендации"
          onClose={() => setShowRecs(false)}
          className="w-3xl"
        >
          {recsLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader className="size-6 animate-spin windows95-text" />
            </div>
          ) : recs.length === 0 ? (
            <div className="flex items-center justify-center flex-1">
              <span className="windows95-text">Нет рекомендаций</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 overflow-y-auto min-h-0 flex-1 pb-1">
              {recs.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-row items-center gap-2 windows95-active-border bg-primary p-1 hover:bg-surface hover:cursor-pointer"
                  onClick={() => {
                    setShowRecs(false);
                    setSelectedAnime({ animeId: r.id });
                  }}
                >
                  {r.cover_url && (
                    <img
                      src={r.cover_url}
                      alt=""
                      className="w-10 shrink-0 windows95-active-border"
                    />
                  )}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="text-[10px] font-bold truncate windows95-text"
                      title={r.title}
                    >
                      {r.title}
                    </span>
                    <div className="flex flex-row gap-2 text-[9px] windows95-text">
                      {r.score && <span>★ {r.score}</span>}
                      {r.format && <span>{r.format}</span>}
                      {r.episodes && <span>{r.episodes} эп.</span>}
                    </div>
                  </div>
                  <span className="flex flex-row gap-1 text-[9px] shrink-0 windows95-text items-center">
                    <Star className="size-3" /> {r.recommendation_rating}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}

export default AnilistRoute;
