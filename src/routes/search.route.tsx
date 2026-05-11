import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { Anime, LanguageTag, SettingsScraper } from "@/types";
import { useEffect, useState } from "react";
import { detectLanguages, formatSize } from "@/lib/utils";
import { languages, qualities, encodings } from "@/config/index.config";
import { Button } from "@/components/ui/button.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Search, Download, Clipboard, ExternalLink, LogOut, Loader } from "lucide-react";
import { Input } from "@/components/ui/input.component";
import { useTorrentStore } from "@/store/download.store";
import RutrackerLoginModal from "@/components/shared/rutracker.login";

type Source = "erai-raws" | "rutracker";

function SearchRoute() {
  const prepareTorrentDownload = useTorrentStore(
    (s) => s.prepareTorrentDownload,
  );
  const [searchParams, setSearchParams] = useState<string>("");
  const [source, setSource] = useState<Source>("erai-raws");
  const [rutrackerAuth, setRutrackerAuth] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [magnets, setMagnets] = useState<Record<string, string>>({});
  const [loadingMagnet, setLoadingMagnet] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<SettingsScraper>({
    quality: "all",
    language: "all",
    sort: "seeders",
    encoding: "all",
  });

  useEffect(() => {
    invoke<boolean>("check_rutracker_session").then(setRutrackerAuth).catch(() => setRutrackerAuth(false));
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["animeScraper", source],
    queryFn: async (): Promise<Anime[]> => {
      if (source === "rutracker") {
        setMagnets({});
        setLoadingMagnet({});
        return await invoke<Anime[]>("search_rutracker", {
          query: searchParams.trim(),
        });
      }
      return await invoke<Anime[]>("search_erairaws", {
        query: searchParams.trim(),
        encoding: settings.encoding,
      });
    },
    enabled: false,
  });

  const filtered = data?.filter((res) => {
    if (settings.quality !== "all") {
      if (
        !res.title.toLowerCase().includes(settings.quality) &&
        !res.title.toLowerCase().includes(settings.quality.slice(0, -1))
      ) {
        return false;
      }
    }
    if (settings.language !== "all") {
      const language: LanguageTag[] = detectLanguages(res.title);
      if (!language.some((l) => l.code === settings.language)) return false;
    }
    return true;
  });

  const sorted = filtered?.sort((a, b) => {
    const sortMap = {
      seeders: b.seeders - a.seeders,
      leechers: b.leechers - a.leechers,
      size: b.size.length - a.size.length,
    };
    return sortMap[settings.sort] ?? 0;
  });

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
      return null;
    } finally {
      setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCopyMagnet = async (item: Anime) => {
    const magnet = item.magnet || await ensureMagnet(item);
    if (magnet) navigator.clipboard.writeText(magnet);
  };

  const handleOpenMagnet = async (item: Anime) => {
    const magnet = item.magnet || await ensureMagnet(item);
    if (magnet) document.location.assign(magnet);
  };

  const handleDownload = async (item: Anime) => {
    const magnet = item.magnet || await ensureMagnet(item);
    if (magnet) prepareTorrentDownload(magnet);
  };

  return (
    <div className="h-full flex flex-col w-full gap-1">
      <section className="flex flex-row gap-2 w-full">
        <Input
          placeholder="Найти аниме..."
          value={searchParams}
          className="h-9 font-bold bg-white"
          onChange={(e) => setSearchParams(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") refetch();
          }}
        />
        <Button
          variant="default"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? (
            <SmallLoader />
          ) : (
            <Search className="pointer-events-none" />
          )}
        </Button>
        <select
          className="h-9 windows95-border px-1 text-text windows95-text windows95-select"
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
        >
          <option value="erai-raws">Erai-Raws</option>
          <option value="rutracker">Rutracker</option>
        </select>
        {source === "rutracker" && !rutrackerAuth && (
          <Button variant="default" onClick={() => setShowLogin(true)}>
            Войти
          </Button>
        )}
        {source === "rutracker" && rutrackerAuth && (
          <Button variant="default" onClick={handleLogout}>
            <LogOut className="size-3.5" />
          </Button>
        )}
      </section>
      <section className="flex flex-row gap-2 w-full">
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-text windows95-text">Качество:</span>
          {qualities.map((q) => (
            <Button
              key={q}
              variant={settings.quality === q ? "outline" : "default"}
              onClick={() => setSettings((prev) => ({ ...prev, quality: q }))}
              className="windows95-small-border"
            >
              {q === "all" ? "Все" : q}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-text windows95-text">Язык:</span>
          {languages.map((l) => (
            <Button
              key={l}
              variant={settings.language === l ? "outline" : "default"}
              onClick={() =>
                setSettings((prev) => ({ ...prev, language: l }))
              }
              className="windows95-small-border"
            >
              {l === "all" ? "Все" : l}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-text windows95-text">Сортировка:</span>
          <select
            className="h-6 windows95-border px-1 text-text windows95-text windows95-select"
            value={settings.sort}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                sort: e.target.value as SettingsScraper["sort"],
              }))
            }
          >
            <option value="seeders">Сидеры</option>
            <option value="leechers">Личи</option>
            <option value="size">Размер</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-text windows95-text">Кодек:</span>
          <select
            className="h-6 windows95-border px-1 text-text windows95-text windows95-select"
            value={settings.encoding}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                encoding: e.target.value as SettingsScraper["encoding"],
              }))
            }
          >
            {encodings.map((enc) => (
              <option key={enc} value={enc}>
                {enc === "all" ? "Все" : enc}
              </option>
            ))}
          </select>
        </div>
      </section>
      {isError && (
        <section className="windows95-text text-destructive text-[11px]">
          {error?.message}
        </section>
      )}
      {data?.length === 0 && !isError && <span>Ничего не найдено</span>}
      {sorted && (
        <section className="flex flex-col w-full h-full overflow-y-scroll p-0.5 gap-1">
          {sorted.map((item, i) => {
            const isLoadingMag = loadingMagnet[item.link];

            return (
              <div
                key={i}
                className="windows95-active-border bg-primary px-2 py-1.5 mb-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[11px] font-bold leading-tight windows95-font">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {detectLanguages(item.title).map((l) => {
                        const colors: Record<string, string> = {
                          ru: "bg-secondary text-white",
                          en: "bg-secondary text-white",
                          multi: "bg-[#800080] text-white",
                          dual: "bg-[#808000] text-white",
                        };
                        return (
                          <span
                            key={l.code}
                            className={`px-1 text-[10px] windows95-font ${colors[l.code] || "bg-muted text-white"}`}
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
                      <span className="windows95-text text-[11px]">Загрузка магнита...</span>
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
                  ) : item.link && (
                    <Button
                      onClick={() => document.location.assign(item.link)}
                      className="inline-flex items-center gap-0.5 windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline cursor-pointer"
                    >
                      <ExternalLink className="size-3" />
                      Открыть
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
      {showLogin && (
        <RutrackerLoginModal
          setRutrackerAuth={setRutrackerAuth}
          setShowLogin={setShowLogin}
        />
      )}
    </div>
  );
}

export default SearchRoute;
