import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { Anime, LanguageTag, SettingsScraper } from "@/types";
import { useState } from "react";
import { detectLanguages } from "@/lib/utils";
import { languages, qualities } from "@/config/index.config";
import { Button } from "@/components/ui/button.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input.component";

function SearchContent() {
  const [searchParams, setSearchParams] = useState<string>("");
  const [settings, setSettings] = useState<SettingsScraper>({
    quality: "all",
    language: "all",
    sort: "seeders",
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["animeScraper"],
    queryFn: async (): Promise<Anime[]> => {
      const data = await invoke<Anime[]>("search_erairaws", {
        query: searchParams.trim(),
      });
      return data;
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
          {isLoading ? <SmallLoader /> : <Search />}
        </Button>
      </section>
      <section className="flex flex-row gap-2 w-full">
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-text text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
            Качество:
          </span>
          {qualities.map((q) => (
            <Button
              key={q}
              variant={settings.quality === q ? "outline" : "default"}
              onClick={() => setSettings((prev) => ({ ...prev, quality: q }))}
            >
              {q === "all" ? "Все" : q}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-text text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
            Язык:
          </span>
          {languages.map((l) => (
            <Button
              key={l}
              variant={settings.language === l ? "outline" : "default"}
              onClick={() => setSettings((prev) => ({ ...prev, language: l }))}
            >
              {l === "all" ? "Все" : l}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-text text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
            Сортировка:
          </span>
          <select
            className="h-6 border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white px-1 text-text text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] outline-none focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-text"
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
        {filtered && (
          <span className="text-xs text-text font-bold self-center ml-auto border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-white px-1">
            Найдено: {filtered.length}
          </span>
        )}
      </section>
      {isError && <section>{error?.message}</section>}
      {(!data || data.length === 0) && !isError && (
        <section>{searchParams && !data && "Ничего не найдено"}</section>
      )}
      {sorted && (
        <section className="flex flex-col w-full h-full overflow-y-scroll p-0.5 gap-1">
          {sorted.map((item, i) => (
            <div
              key={i}
              className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-2 py-1.5 mb-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[11px] font-bold leading-tight font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                    {item.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detectLanguages(item.title).map((l) => {
                      const colors: Record<string, string> = {
                        ru: "bg-[#000080] text-white",
                        en: "bg-[#008000] text-white",
                        multi: "bg-[#800080] text-white",
                        dual: "bg-[#808000] text-white",
                      };
                      return (
                        <span
                          key={l.code}
                          className={`px-1 text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] ${colors[l.code] || "bg-[#808080] text-white"}`}
                        >
                          {l.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                    {item.size}
                  </span>
                  <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-[#008000]">
                    S:{item.seeders}
                  </span>
                  <span className="text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-[#800000]">
                    L:{item.leechers}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex gap-1">
                {item.magnet && (
                  <a
                    href={item.magnet}
                    className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-2 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-text no-underline active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white"
                  >
                    Магнит
                  </a>
                )}
                {item.torrent && (
                  <a className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-2 py-0.5 text-[11px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-text no-underline active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white">
                    Прямое скачивание
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default SearchContent;
