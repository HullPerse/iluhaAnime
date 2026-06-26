import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, Loader, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import AniListAuth from "./components/anilist/auth.anilist";
import AniListDetail from "./components/anilist/details.anilist";

interface AniMedia {
  id: number;
  title: string;
  english_title: string | null;
  native_title: string | null;
  episodes: number | null;
  duration: number | null;
  status: string;
  score: number | null;
  genres: string[];
  tags: string[];
  description: string | null;
  cover_url: string | null;
  season: string | null;
  season_year: number | null;
  studios: string[];
  next_episode: number | null;
  next_airing_at: number | null;
}

interface AniUser {
  id: number;
  name: string;
  avatar: string | null;
  anime_count: number;
  episodes_watched: number;
  mean_score: number | null;
}

interface AniListEntry {
  media: AniMedia;
  progress: number | null;
  list_status: string;
}

interface AniListCollection {
  name: string;
  entries: AniListEntry[];
}

const statusLabels: Record<string, string> = {
  FINISHED: "Завершён",
  RELEASING: "Выходит",
  NOT_YET_RELEASED: "Анонс",
  CANCELLED: "Отменён",
  HIATUS: "На паузе",
};

const listLabels: Record<string, string> = {
  CURRENT: "Смотрю",
  PLANNING: "Запланировано",
  COMPLETED: "Просмотрено",
  DROPPED: "Брошено",
  PAUSED: "На паузе",
  REPEATING: "Пересматриваю",
};

function AniListRoute() {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<AniUser | null>(null);
  const [lists, setLists] = useState<AniListCollection[]>([]);
  const [activeList, setActiveList] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [selectedAnimeData, setSelectedAnimeData] = useState<{
    animeId: number;
    listEntry?: { progress: number | null; list_status: string };
  } | null>(null);
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [sort, setSort] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "default", dir: "desc" });

  useEffect(() => {
    invoke<AniUser | null>("check_anilist_auth")
      .then((u) => {
        if (u) {
          setUser(u);
          invoke<AniListCollection[]>("get_anilist_lists", { userId: u.id })
            .then((l) => {
              setLists(l);
              const first = l.find((c) => c.entries.length > 0);
              if (first) setActiveList(first.name);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["anilist", query.trim()],
    queryFn: () =>
      invoke<AniMedia[]>("search_anilist", { query: query.trim() }),
    enabled: false,
  });

  const handleLogout = async () => {
    await invoke("anilist_logout");
    setUser(null);
    setLists([]);
    setActiveList("");
  };

  const activeEntries = lists.find((c) => c.name === activeList)?.entries ?? [];
  const entryLookup = useMemo(() => {
    const map = new Map<
      number,
      { progress: number | null; list_status: string }
    >();
    for (const list of lists) {
      for (const e of list.entries) {
        map.set(e.media.id, {
          progress: e.progress,
          list_status: e.list_status,
        });
      }
    }
    return map;
  }, [lists]);

  const filteredEntries = activeEntries.filter((e) => {
    if (!query.trim() || showGlobalResults) return true;
    const q = query.toLowerCase();
    return (
      e.media.title.toLowerCase().includes(q) ||
      (e.media.english_title?.toLowerCase().includes(q) ?? false) ||
      (e.media.native_title?.toLowerCase().includes(q) ?? false)
    );
  });

  const sortedEntries = useMemo(() => {
    const copy = [...filteredEntries];
    if (sort.key === "title") {
      copy.sort((a, b) => {
        const c = a.media.title.localeCompare(b.media.title);
        return sort.dir === "asc" ? c : -c;
      });
    } else if (sort.key === "score") {
      copy.sort((a, b) => {
        const d = (b.media.score ?? -1) - (a.media.score ?? -1);
        return sort.dir === "desc" ? d : -d;
      });
    } else if (sort.key === "progress") {
      copy.sort((a, b) => {
        const d = (b.progress ?? -1) - (a.progress ?? -1);
        return sort.dir === "desc" ? d : -d;
      });
    }
    return copy;
  }, [filteredEntries, sort]);

  const displayItems =
    showGlobalResults && data ? data : sortedEntries.map((e) => e.media);
  const isGlobalSearch = showGlobalResults;
  const isLocalFilter = !!query.trim() && !showGlobalResults;

  const doGlobalSearch = () => {
    if (!query.trim()) return;
    setShowGlobalResults(true);
    refetch();
  };

  const resetToLists = () => {
    setQuery("");
    setShowGlobalResults(false);
  };

  return (
    <div className="h-full flex flex-col w-full gap-1">
      {/* Top bar */}
      <section className="flex flex-row gap-2 w-full">
        <Input
          placeholder={
            user && !isGlobalSearch
              ? "Фильтр в списке..."
              : "Поиск аниме на AniList..."
          }
          value={query}
          className="h-9 font-bold bg-white"
          onChange={(e) => {
            setQuery(e.target.value);
            if (isGlobalSearch && !e.target.value.trim()) resetToLists();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              if (isGlobalSearch) refetch();
              else doGlobalSearch();
            }
          }}
        />
        {isGlobalSearch ? (
          <Button
            variant="outline"
            size="icon"
            onClick={resetToLists}
            title="Вернуться к спискам"
          >
            <LogOut className="size-4 rotate-90" />
          </Button>
        ) : (
          <Button
            variant="default"
            size="icon"
            onClick={doGlobalSearch}
            disabled={isLoading || !query.trim()}
          >
            {isLoading ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
        )}
        {user && !isGlobalSearch && (
          <Button
            size="icon"
            variant="default"
            onClick={handleLogout}
            title="Выйти"
          >
            <LogOut className="size-4" />
          </Button>
        )}
        {!user && (
          <Button
            size="icon"
            variant="default"
            onClick={() => setShowAuth(true)}
            title="Авторизация"
          >
            <User className="size-4" />
          </Button>
        )}
      </section>

      {/* Mode indicator */}
      {isLocalFilter && (
        <span className="text-[10px] windows95-text px-0.5">
          Фильтр: {filteredEntries.length} из {activeEntries.length} в списке
          &quot;{listLabels[activeList] ?? activeList}&quot; · нажмите ↵ для
          поиска по всей AniList
        </span>
      )}
      {isGlobalSearch && (
        <span className="text-[10px] windows95-text px-0.5">
          Поиск по AniList: &quot;{query}&quot; ·{" "}
          {data ? `${data.length} результатов` : "..."}
        </span>
      )}

      {/* User profile */}
      {user && !isGlobalSearch && !isLocalFilter && (
        <section className="flex items-center gap-2 windows95-active-border bg-primary px-2 py-1">
          {user.avatar && (
            <img
              src={user.avatar}
              alt=""
              className="size-8 windows95-active-border"
            />
          )}
          <div className="flex flex-col">
            <span className="windows95-text font-bold text-[11px]">
              {user.name}
            </span>
            <span className="text-[10px] windows95-text">
              {lists.reduce((s, c) => s + c.entries.length, 0)} в списках
            </span>
          </div>
        </section>
      )}

      {/* List tabs + sort */}
      {user && lists.length > 0 && !isGlobalSearch && (
        <section className="flex flex-wrap gap-1">
          {lists
            .filter((c) => c.entries.length > 0)
            .map((c) => (
              <Button
                key={c.name}
                variant={
                  activeList === c.name && !isLocalFilter
                    ? "outline"
                    : "default"
                }
                onClick={() => {
                  setActiveList(c.name);
                  if (isGlobalSearch) resetToLists();
                }}
                className="text-[10px]"
              >
                {listLabels[c.name] ?? c.name} ({c.entries.length})
              </Button>
            ))}
          <span className="text-[10px] windows95-text self-center ml-1 mr-0.5">
            |
          </span>
          {(["default", "score", "title", "progress"] as const).map((s) => (
            <Button
              key={s}
              variant={sort.key === s ? "outline" : "default"}
              onClick={() => {
                if (sort.key === s)
                  setSort((p) => ({
                    ...p,
                    dir: p.dir === "asc" ? "desc" : "asc",
                  }));
                else setSort({ key: s, dir: s === "title" ? "asc" : "desc" });
              }}
              className="text-[9px]"
            >
              {s === "default"
                ? "по умолч."
                : s === "score"
                  ? `★ рейтинг${sort.key === s ? (sort.dir === "asc" ? "↑" : "↓") : ""}`
                  : s === "title"
                    ? `А–Я${sort.key === s ? (sort.dir === "asc" ? "↑" : "↓") : ""}`
                    : `прогресс${sort.key === s ? (sort.dir === "asc" ? "↑" : "↓") : ""}`}
            </Button>
          ))}
        </section>
      )}

      {/* Content */}
      {displayItems.length > 0 && (
        <section className="flex flex-col w-full h-full overflow-y-scroll p-0.5 gap-1">
          {displayItems.map((item) => {
            const entry = entryLookup.get(item.id);
            return (
              <div
                key={item.id}
                className="windows95-active-border bg-primary px-2 py-1.5 mb-0.5 cursor-pointer"
                onClick={() =>
                  setSelectedAnimeData({
                    animeId: item.id,
                    listEntry: entry
                      ? {
                          progress: entry.progress,
                          list_status: entry.list_status,
                        }
                      : undefined,
                  })
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[11px] font-bold leading-tight windows95-font windows95-text">
                      {item.title}
                    </h3>
                    <div className="flex flex-wrap gap-1 items-center mt-1">
                      {item.score && (
                        <span className="text-[10px] windows95-font px-1 bg-secondary text-white">
                          ★ {item.score}
                        </span>
                      )}
                      <span className="text-[10px] windows95-font text-text">
                        {statusLabels[item.status] ?? item.status}
                      </span>
                      {entry != null && entry.progress != null && (
                        <span className="text-[10px] windows95-font px-1 bg-accent text-white">
                          {entry.progress}/{item.episodes ?? "?"}
                        </span>
                      )}
                      {!entry && item.episodes && (
                        <span className="text-[10px] windows95-font text-text">
                          {item.episodes} эп.
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.genres.slice(0, 4).map((g) => (
                        <span
                          key={g}
                          className="px-1 text-[10px] windows95-font bg-muted text-white"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                  {item.cover_url && (
                    <img
                      src={item.cover_url}
                      alt=""
                      className="w-14 windows95-active-border shrink-0"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {displayItems.length === 0 && !isGlobalSearch && !isLocalFilter && (
        <section className="flex flex-col items-center justify-center flex-1 gap-2">
          <span className="windows95-text text-[11px]">
            {user
              ? "Выберите список или начните поиск"
              : "Авторизуйтесь или начните поиск"}
          </span>
        </section>
      )}

      {displayItems.length === 0 && isLocalFilter && (
        <span className="windows95-text text-[11px] px-0.5">
          Ничего не найдено в списке
        </span>
      )}

      {data?.length === 0 && isGlobalSearch && (
        <span className="windows95-text text-[11px] px-0.5">
          Ничего не найдено на AniList
        </span>
      )}

      {showAuth && (
        <AniListAuth
          onAuth={(u) => {
            setUser(u);
            setShowAuth(false);
            invoke<AniListCollection[]>("get_anilist_lists", { userId: u.id })
              .then((l) => {
                setLists(l);
                const first = l.find((c) => c.entries.length > 0);
                if (first) setActiveList(first.name);
              })
              .catch(() => {});
          }}
          onClose={() => setShowAuth(false)}
        />
      )}

      {selectedAnimeData && (
        <AniListDetail
          animeId={selectedAnimeData.animeId}
          listEntry={selectedAnimeData.listEntry}
          isLoggedIn={user !== null}
          onClose={() => setSelectedAnimeData(null)}
          onSaved={() => {
            if (user) {
              invoke<AniListCollection[]>("get_anilist_lists", {
                userId: user.id,
              }).then((l) => setLists(l));
            }
          }}
        />
      )}
    </div>
  );
}

export default AniListRoute;
