import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { Anime, LanguageTag, SettingsScraper } from "@/types";
import { useState } from "react";
import { detectLanguages, formatSize } from "@/lib/utils";
import { languages, qualities } from "@/config/index.config";
import { Button } from "@/components/ui/button.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Search, Download, Clipboard } from "lucide-react";
import { Input } from "@/components/ui/input.component";
import { useTorrentStore } from "@/store/download.store";
import TorrentFilePicker from "@/routes/components/picker.search";

function SearchRoute() {
  const prepareTorrentDownload = useTorrentStore(
    (s) => s.prepareTorrentDownload,
  );
  const pendingTorrent = useTorrentStore((s) => s.pendingTorrent);
  const preparingTorrent = useTorrentStore((s) => s.preparingTorrent);
  const lastSaveDir = useTorrentStore((s) => s.lastSaveDir);
  const confirmDownload = useTorrentStore((s) => s.confirmDownload);
  const cancelDownload = useTorrentStore((s) => s.cancelDownload);
  const [searchParams, setSearchParams] = useState<string>("");
  const [source, setSource] = useState<"erairaws" | "nyaa">("erairaws");
  const [settings, setSettings] = useState<SettingsScraper>({
    quality: "all",
    language: "all",
    sort: "seeders",
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["animeScraper", source],
    queryFn: async (): Promise<Anime[]> => {
      if (source === "nyaa") {
        return await invoke<Anime[]>("search_nyaa", {
          query: searchParams.trim(),
        });
      }
      return await invoke<Anime[]>("search_erairaws", {
        query: searchParams.trim(),
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

  return (
    <div className="h-full flex flex-col w-full gap-1">
      <section className="flex flex-row gap-2 w-full">
        <Input
          placeholder="Найти аниме..."
          value={searchParams}
          className="h-9 font-bold"
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
              onClick={() => setSettings((prev) => ({ ...prev, language: l }))}
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
          <span className="text-text windows95-text">Источник:</span>
          <select
            className="h-6 windows95-border px-1 text-text windows95-text windows95-select"
            value={source}
            onChange={(e) => setSource(e.target.value as "erairaws" | "nyaa")}
          >
            <option value="erairaws">Erai-Raws</option>
            <option value="nyaa">Nyaa.si</option>
          </select>
        </div>
      </section>
      {isError && <section>{error?.message}</section>}
      {data?.length === 0 && !isError && <span>Ничего не найдено</span>}
      {sorted && (
        <section className="flex flex-col w-full h-full overflow-y-scroll p-0.5 gap-1">
          {sorted.map((item, i) => (
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
                {item.magnet && (
                  <Button
                    size="icon"
                    onClick={() => navigator.clipboard.writeText(item.magnet)}
                    className="windows95-active-border bg-primary windows95-text size-5.5"
                  >
                    <Clipboard />
                  </Button>
                )}
                {item.magnet && (
                  <Button
                    onClick={() => document.location.assign(item.magnet)}
                    className="windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline"
                  >
                    Магнит
                  </Button>
                )}
                {item.magnet && (
                  <Button
                    onClick={() => prepareTorrentDownload(item.magnet)}
                    className="inline-flex items-center gap-0.5 windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline cursor-pointer"
                  >
                    <Download className="size-3" />
                    Скачать
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {(preparingTorrent || pendingTorrent) && (
        <TorrentFilePicker
          torrent={pendingTorrent}
          loading={!!preparingTorrent && !pendingTorrent}
          defaultSaveDir={lastSaveDir}
          onConfirm={(selectedIndices, saveDir, subFolder) =>
            confirmDownload(selectedIndices, saveDir, subFolder)
          }
          onCancel={cancelDownload}
        />
      )}
    </div>
  );
}

export default SearchRoute;
