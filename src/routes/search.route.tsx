import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { Anime, LanguageTag, SettingsScraper } from "@/types";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { showToast } from "@/lib/toast.utils";
import { useEffect, useState, useMemo } from "react";
import {
  detectLanguages,
  formatSize,
  parseSize,
  qualityMatch,
} from "@/lib/index.utils";
import { useSearchStore } from "@/store/search.store";
import { languages, qualities, encodings } from "@/config/scraper.config";
import { Button } from "@/components/ui/button.component";
import { SmallLoader } from "@/components/shared/loader.component";
import {
  Search,
  Download,
  Clipboard,
  ExternalLink,
  LogOut,
  Loader,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useTorrentStore } from "@/store/download.store";
import RutrackerLoginModal from "@/routes/components/search/rutracker.search";
import NekoBtApiModal from "@/routes/components/search/nekobt.search";
import { flushSync } from "react-dom";
import { Source } from "@/types/search";
import { PER_PAGE, SOURCE_INFOS } from "@/config/search.config";
import { useSettingsStore } from "@/store/settings.store";

function SearchRoute() {
  const prepareTorrentDownload = useTorrentStore(
    (s) => s.prepareTorrentDownload,
  );
  const defaultSource = useSettingsStore((s) => s.defaultSearchSource);
  const visibleSources = useSettingsStore((s) => s.visibleSources);

  const sourceOptions = useMemo(
    () =>
      SOURCE_INFOS.filter((s) => visibleSources.includes(s.value)).map((s) => ({
        value: s.value,
        label: s.nsfw ? `${s.label} (NSFW)` : s.label,
      })),
    [visibleSources],
  );

  const initialSource = visibleSources.includes(defaultSource)
    ? defaultSource
    : (visibleSources[0] ?? "");

  const [searchParams, setSearchParams] = useState<string>("");
  const [source, setSource] = useState<Source>(initialSource as Source);
  const [rutrackerAuth, setRutrackerAuth] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [nekobtAuth, setNekoBtAuth] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [magnets, setMagnets] = useState<Record<string, string>>({});
  const [loadingMagnet, setLoadingMagnet] = useState<Record<string, boolean>>(
    {},
  );
  const [nyaaPage, setNyaaPage] = useState(1);
  const [settings, setSettings] = useState<SettingsScraper>({
    quality: "all",
    language: "all",
    sort: "seeders",
    encoding: "all",
  });
  const searchHistory = useSearchStore((s) => s.history);
  const addQuery = useSearchStore((s) => s.addQuery);
  const removeQuery = useSearchStore((s) => s.removeQuery);
  const crossSearchQuery = useSearchStore((s) => s.crossSearchQuery);
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    invoke<boolean>("check_rutracker_session")
      .then(setRutrackerAuth)
      .catch(() => setRutrackerAuth(false));
    invoke<boolean>("check_nekobt_session")
      .then(setNekoBtAuth)
      .catch(() => setNekoBtAuth(false));
  }, []);

  useEffect(() => {
    if (!visibleSources.includes(source) && visibleSources.length > 0) {
      setSource(visibleSources[0] as Source);
      setNyaaPage(1);
    }
  }, [visibleSources, source]);

  const queryKey: unknown[] = useMemo(
    () => [
      "animeScraper",
      source,
      searchParams.trim(),
      settings.quality,
      settings.language,
      settings.sort,
      settings.encoding,
      nyaaPage,
    ],
    [
      source,
      searchParams,
      settings.quality,
      settings.language,
      settings.sort,
      settings.encoding,
      nyaaPage,
    ],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Anime[]> => {
      setMagnets({});
      setLoadingMagnet({});

      if (source === "rutracker") {
        return await invoke<Anime[]>("search_rutracker", {
          query: searchParams.trim(),
        });
      }
      if (source === "nyaa") {
        return await invoke<Anime[]>("search_nyaa", {
          query: searchParams.trim(),
          page: nyaaPage,
        });
      }
      if (source === "sukebei") {
        return await invoke<Anime[]>("search_sukebei", {
          query: searchParams.trim(),
          page: nyaaPage,
        });
      }
      if (source === "nekobt") {
        return await invoke<Anime[]>("search_nekobt", {
          query: searchParams.trim(),
          page: nyaaPage,
        });
      }
      return await invoke<Anime[]>("search_erairaws", {
        query: searchParams.trim(),
        encoding: settings.encoding,
      });
    },
    enabled: false,
  });

  useEffect(() => {
    if (crossSearchQuery) {
      setSearchParams(crossSearchQuery);
      setCrossSearchQuery(null);
    }
  }, [crossSearchQuery]);

  const filtered = useMemo(
    () =>
      data?.filter((res) => {
        if (settings.quality !== "all") {
          if (!qualityMatch(res.title, settings.quality)) {
            return false;
          }
        }
        if (settings.language !== "all") {
          const language: LanguageTag[] = detectLanguages(res.title);
          if (!language.some((l) => l.code === settings.language)) return false;
        }
        return true;
      }),
    [data, settings.quality, settings.language],
  );

  const sorted = useMemo(
    () =>
      filtered?.sort((a, b) => {
        const sortMap = {
          seeders: b.seeders - a.seeders,
          leechers: b.leechers - a.leechers,
          size: parseSize(b.size) - parseSize(a.size),
        };
        return sortMap[settings.sort] ?? 0;
      }),
    [filtered, settings.sort],
  );

  const displayItems = useMemo(
    () => sorted?.slice(0, source === "nyaa" ? PER_PAGE : undefined),
    [sorted, source],
  );

  const handleLogout = async () => {
    await invoke("rutracker_logout");
    setRutrackerAuth(false);
  };

  const ensureMagnet = async (item: Anime): Promise<string | null> => {
    const key = item.link;
    if (magnets[key]) return magnets[key];
    if (loadingMagnet[key]) return null;

    setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
    try {
      const magnet = await invoke<string>("rutracker_get_magnet", {
        topicId: item.category,
      });
      setMagnets((prev) => ({ ...prev, [key]: magnet }));
      return magnet;
    } catch {
      showToast("Не удалось получить магнит-ссылку", "error");
      return null;
    } finally {
      setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCopyMagnet = async (item: Anime) => {
    const magnet = item.magnet || (await ensureMagnet(item));
    if (magnet) writeText(magnet);
  };

  const handleOpenMagnet = async (item: Anime) => {
    const magnet = item.magnet || (await ensureMagnet(item));
    if (magnet) document.location.assign(magnet);
  };

  const handleDownload = async (item: Anime) => {
    const magnet = item.magnet || (await ensureMagnet(item));
    if (magnet) prepareTorrentDownload(magnet);
  };

  return (
    <main className="h-full flex flex-col w-full gap-1">
      <section className="flex flex-row gap-2 w-full">
        <div className="relative flex-1">
          <Input
            placeholder="Найти аниме..."
            value={searchParams}
            className="h-9 font-bold bg-white"
            onChange={(e) => setSearchParams(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addQuery(searchParams.trim());
                refetch();
              }
            }}
          />
          {showHistory && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 windows95-border bg-white max-h-32 overflow-y-auto p-0.5">
              {searchHistory.map((item, i) => (
                <div key={item} className="flex w-full items-center">
                  <Button
                    className="flex-1 justify-start font-bold windows95-text h-6"
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => {
                      flushSync(() => {
                        setSearchParams(item);
                        setShowHistory(false);
                      });
                      refetch();
                    }}
                  >
                    {i + 1}. {item}
                  </Button>
                  <Button
                    size="icon"
                    className="size-6"
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeQuery(item);
                      setShowHistory(true);
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="default"
          size="icon"
          onClick={() => {
            addQuery(searchParams.trim());
            refetch();
          }}
          disabled={isLoading || sourceOptions.length === 0}
        >
          {isLoading ? (
            <SmallLoader />
          ) : (
            <Search className="pointer-events-none" />
          )}
        </Button>
        <Select
          className="h-9 min-w-30 max-w-30"
          value={source}
          onChange={(v) => {
            setSource(v as Source);
            setNyaaPage(1);
          }}
          options={sourceOptions}
          disabled={sourceOptions.length === 0}
        />

        {source === "rutracker" && !rutrackerAuth && (
          <Button
            variant="default"
            size="icon"
            onClick={() => setShowLogin(true)}
          >
            <UserPlus />
          </Button>
        )}

        {source === "nekobt" && !nekobtAuth && (
          <Button variant="default" onClick={() => setShowApiModal(true)}>
            ключ
          </Button>
        )}

        {((source === "nekobt" && nekobtAuth) ||
          (source === "rutracker" && rutrackerAuth)) && (
          <Button
            size="icon"
            variant="error"
            onClick={async () => {
              if (source === "rutracker" && rutrackerAuth) {
                handleLogout();
              } else {
                await invoke("nekobt_logout");
                setNekoBtAuth(false);
              }
            }}
          >
            <LogOut />
          </Button>
        )}
      </section>

      <section className="flex flex-row gap-2 w-full">
        <div className="flex flex-row gap-1 items-center">
          <span className="text-text windows95-text">Качество:</span>
          {qualities.map((q) => (
            <Button
              key={q}
              variant={settings.quality === q ? "outline" : "default"}
              onClick={() => setSettings((prev) => ({ ...prev, quality: q }))}
              className="windows95-border"
            >
              {q === "all" ? "Все" : q}
            </Button>
          ))}
        </div>
        <div className="flex flex-row gap-1 items-center">
          <span className="text-text windows95-text">Язык:</span>
          {languages.map((l) => (
            <Button
              key={l}
              variant={settings.language === l ? "outline" : "default"}
              onClick={() => setSettings((prev) => ({ ...prev, language: l }))}
              className="windows95-border"
            >
              {l === "all" ? "Все" : l}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-text windows95-text">Сортировка:</span>
          <Select
            className="w-22"
            value={settings.sort}
            onChange={(v) =>
              setSettings((prev) => ({
                ...prev,
                sort: v as SettingsScraper["sort"],
              }))
            }
            options={[
              { value: "seeders", label: "Сидеры" },
              { value: "leechers", label: "Личи" },
              { value: "size", label: "Размер" },
            ]}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-text windows95-text">Кодек:</span>
          <Select
            className="w-22"
            value={settings.encoding}
            onChange={(v) =>
              setSettings((prev) => ({
                ...prev,
                encoding: v as SettingsScraper["encoding"],
              }))
            }
            options={encodings.map((enc) => ({
              value: enc,
              label: enc === "all" ? "Все" : enc,
            }))}
          />
        </div>
      </section>

      {isError && (
        <section className="windows95-text text-destructive">
          {error?.message}
        </section>
      )}

      {data?.length === 0 && !isError && <span>Ничего не найдено</span>}

      {displayItems && (
        <section className="flex flex-col w-full h-full overflow-y-auto p-0.5 gap-1">
          {displayItems.map((item, i) => {
            const isLoadingMag = loadingMagnet[item.link];

            return (
              <div
                key={i}
                className="windows95-active-border bg-primary px-2 py-1.5 mb-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate font-bold leading-tight windows95-text"
                      title={item.title}
                    >
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {detectLanguages(item.title).map((l) => {
                        const colors: Record<
                          SettingsScraper["language"] & "dual",
                          string
                        > = {
                          ru: "bg-secondary text-white",
                          en: "bg-secondary text-white",
                          multi: "bg-multi text-white",
                          dual: "bg-dual text-white",
                        };
                        return (
                          <span
                            key={l.code}
                            className={`px-1 text-[10px] windows95-font ${colors[l.code as SettingsScraper["language"] & "dual"] || "bg-muted text-white"}`}
                          >
                            {l.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="windows95-text">
                      {formatSize(item.size)}
                    </span>
                    <span className="windows95-text text-success">
                      S:{item.seeders}
                    </span>
                    <span className="windows95-text text-destructive">
                      L:{item.leechers}
                    </span>
                  </div>
                </div>

                <div className="mt-1 flex gap-1">
                  {isLoadingMag ? (
                    <div className="flex items-center gap-1">
                      <Loader className="size-3 animate-spin" />
                      <span className="windows95-text">
                        Загрузка магнита...
                      </span>
                    </div>
                  ) : item.magnet || source === "rutracker" ? (
                    <>
                      <Button
                        size="icon"
                        onClick={() => handleCopyMagnet(item)}
                        disabled={loadingMagnet[item.link]}
                        className="windows95-active-border bg-primary windows95-text size-5.5"
                      >
                        <Clipboard />
                      </Button>
                      <Button
                        onClick={() => handleOpenMagnet(item)}
                        disabled={loadingMagnet[item.link]}
                        className="windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline"
                      >
                        Магнит
                      </Button>
                      <Button
                        onClick={() => handleDownload(item)}
                        disabled={loadingMagnet[item.link]}
                        className="inline-flex items-center gap-0.5 windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline cursor-pointer"
                      >
                        <Download className="size-3" />
                        Скачать
                      </Button>
                    </>
                  ) : (
                    item.link && (
                      <Button
                        onClick={() => document.location.assign(item.link)}
                        className="inline-flex items-center gap-0.5 windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline cursor-pointer"
                      >
                        <ExternalLink className="size-3" />
                        Открыть
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {(source === "nyaa" || source === "nekobt") &&
        displayItems &&
        displayItems.length > 0 && (
          <section className="flex items-center justify-end gap-1 py-1">
            <span className="windows95-text mr-1">Стр. {nyaaPage}</span>
            <Button
              size="icon"
              className="size-5"
              disabled={nyaaPage <= 1 || isLoading}
              onClick={() => {
                setNyaaPage((p) => Math.max(1, p - 1));
                setTimeout(() => refetch(), 0);
              }}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <Button
              size="icon"
              className="size-5"
              disabled={displayItems.length < PER_PAGE || isLoading}
              onClick={() => {
                setNyaaPage((p) => p + 1);
                setTimeout(() => refetch(), 0);
              }}
            >
              <ChevronRight className="size-3" />
            </Button>
          </section>
        )}

      {showLogin && (
        <RutrackerLoginModal
          setRutrackerAuth={setRutrackerAuth}
          setShowLogin={setShowLogin}
        />
      )}
      {showApiModal && (
        <NekoBtApiModal
          setNekoBtAuth={setNekoBtAuth}
          setShowApiModal={setShowApiModal}
        />
      )}
    </main>
  );
}

export default SearchRoute;
