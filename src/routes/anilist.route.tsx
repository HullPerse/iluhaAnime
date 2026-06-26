import { useCallback, useEffect, useMemo, useState } from "react";
import Auth from "./components/anilist/auth.anilist";
import Details from "./components/anilist/details.anilist";
import type {
  AniListAnime,
  AniListCollection,
  AniListSort,
  AniMedia,
  AniUser,
} from "@/types/anilist";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import {
  filterEntries,
  getSortingLabel,
  getListLabel,
  getStatusLabel,
  sortEntries,
} from "@/lib/anilist.utils";
import { LogOut, Search, User } from "lucide-react";

function AnilistRoute() {
  const [searchTerms, setSearchTerms] = useState<string>("");
  const [user, setUser] = useState<AniUser | null>(null);
  const [lists, setLists] = useState<AniListCollection[]>([]);
  const [currentList, setCurrentList] = useState<string>("");
  const [auth, setAuth] = useState<boolean>(false);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime>(null);
  const [global, setGlobal] = useState<boolean>(false);
  const [sort, setSort] = useState<AniListSort>({
    key: "title",
    dir: "asc",
  });
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<AniMedia[]>([]);

  const { isLoading, refetch } = useQuery({
    queryKey: ["anilist", searchTerms.trim()],
    queryFn: async (): Promise<AniMedia[]> => {
      const res = await invoke<AniMedia[]>("search_anilist", {
        query: searchTerms.trim(),
      });
      setSearchResults(res);
      return res;
    },
    enabled: false,
  });

  const handleGlobal = useCallback(() => {
    setGlobal(true);
    refetch();
  }, [refetch]);

  const handleReset = useCallback(() => {
    setSearchTerms("");
    setGlobal(false);
    setSearchResults([]);
  }, []);

  const handleLogout = useCallback(async () => {
    await invoke("anilist_logout");

    setUser(null);
    setLists([]);
    setCurrentList("");
  }, []);

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
  const displayEntries =
    global ? searchResults : sortedEntries.map((e) => e.media);

  const isLocal = !!searchTerms.trim() && !global;

  return (
    <main className="flex flex-col w-full h-full gap-1">
      {/*TOP*/}
      <section className="flex flex-row gap-2 w-full">
        <Input
          placeholder="Найти аниме..."
          value={searchTerms}
          className="h-9 font-bold bg-white"
          onChange={(e) => {
            setSearchTerms(e.target.value);
            if (global && !e.target.value.trim()) handleReset();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchTerms.trim()) {
              if (global) refetch();
              else handleGlobal();
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
          disabled={global ? false : isLoading || !searchTerms.trim()}
        >
          {global ? <User className="size-4" /> : <Search className="size-4" />}
        </Button>
      </section>

      {/* FILTER */}
      {isLocal && (
        <span className="windows95-text px-1 text-muted">
          {filteredEntries.length}/{activeEntries.length}
        </span>
      )}
      {global && (
        <span className="windows95-text px-1">
          Поиск: &quot;{searchTerms}&quot; ·{" "}
          {searchResults.length > 0 ? `Результатов: ${searchResults.length}` : ""}
        </span>
      )}

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
            size="icon"
            variant="error"
            onClick={handleLogout}
            className="ml-auto"
          >
            <LogOut />
          </Button>
        </section>
      )}

      {/* TABS */}
      {!loadingList && user && lists.length > 0 && !global && (
        <section className="not-only:flex flex-row w-full items-center justify-between">
          <div className="relative flex flex-row gap-1">
            {lists
              .filter((item) => item.entries.length > 0)
              .map((item) => {
                const isActive = currentList === item.name;

                return (
                  <Button
                    key={item.name}
                    className="px-3 py-0.5 border-2 border-solid cursor-pointer windows95-text active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text"
                    style={{
                      borderBottomColor: isActive ? "#c0c0c0" : undefined,
                      marginBottom: isActive ? "-2px" : undefined,
                      top: isActive ? 0 : "2px",
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
          </div>
          <div className="relative flex flex-row gap-1">
            {(["title", "score", "progress"] as AniListSort["key"][]).map(
              (s) => {
                const isActive = sort.key === s;

                return (
                  <Button
                    key={s}
                    variant={isActive ? "outline" : "default"}
                    className="px-3 py-0.5 border-2 border-solid cursor-pointer windows95-text"
                    style={{
                      marginBottom: isActive ? "-2px" : undefined,
                      top: isActive ? 0 : "2px",
                    }}
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
              },
            )}
          </div>
        </section>
      )}

      {/* CONTENT */}
      {displayEntries.length === 0 && !global && !isLocal && !user && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <span className="windows95-text">Войдите в профиль</span>
          <Button onClick={() => setAuth(true)}>Войти</Button>
        </section>
      )}

      {displayEntries.length === 0 && isLocal && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <span className="windows95-text">Ничего не найдено в списке</span>
        </section>
      )}

      {!searchResults.length && global && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <span className="windows95-text">Ничего не найдено на AniList</span>
        </section>
      )}

      {displayEntries.length > 0 && (
        <section className="flex flex-col w-full h-full overflow-y-scroll p-1 gap-1 border windows95-border">
          {displayEntries.map((item) => {
            const entry = entryLookup.get(item.id);

            return (
              <div
                key={item.id}
                className="flex flex-row windows95-active-border bg-primary p-2 hover:cursor-pointer"
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
              >
                <main className="flex flex-row w-full items-start justify-between gap-2">
                  <section className="min-w-0 flex-1 h-full flex flex-col">
                    {/*top*/}
                    <div className="flex flex-row gap-2">
                      <h2 className="truncate font-bold leading-tight windows95-text">
                        {item.title}
                      </h2>
                    </div>

                    {/*bottom*/}
                    <div className="flex flex-row gap-1 items-center mt-auto windows95-text font-bold">
                      {item.score && (
                        <span className="px-1 bg-secondary text-primary">
                          ★ {item.score}
                        </span>
                      )}
                      <span className="text-text">
                        {getStatusLabel(item.status.toUpperCase()) ??
                          item.status}
                      </span>
                      {entry != null && entry.progress != null && (
                        <span className="px-1 bg-accent">
                          {entry.progress}/{item.episodes ?? "?"}
                        </span>
                      )}
                      {!entry && item.episodes && (
                        <span className="text-text">{item.episodes} эп.</span>
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
          onClose={() => setSelectedAnime(null)}
          onSaved={() => {
            if (!user) return;
            invoke<AniListCollection[]>("get_anilist_lists", {
              userId: user.id,
            }).then((res) => setLists(res));
          }}
        />
      )}
    </main>
  );
}

export default AnilistRoute;
