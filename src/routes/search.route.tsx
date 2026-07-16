import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { Anime, SortKey, Source } from "@/types";
import { useEffect, useState, useMemo } from "react";
import { useDebounce } from "@/hooks/debounce.hook";
import { useSearchStore } from "@/store/search.store";
import { Button } from "@/components/ui/button.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { openUrl } from "@tauri-apps/plugin-opener";
import { flushSync } from "react-dom";
import { SOURCE_INFOS } from "@/config/search.config";
import { useSettingsStore } from "@/store/settings.store";
import {
  sortAnimeResults,
  getVisibleSources,
} from "@/lib/search.logic";
import { copyMagnet, openMagnet, downloadMagnet } from "@/lib/magnet.utils";

import SearchResultItem from "@/routes/components/search/result.search";
import SearchHistoryDropdown from "@/routes/components/search/history.search";
import SearchFiltersBar from "@/routes/components/search/filters.search";
import SearchAuthButtons from "@/routes/components/search/auth.search";
import RutrackerLoginModal from "@/routes/components/search/rutracker.search";
import NekoBtApiModal from "@/routes/components/search/nekobt.search";

function SearchRoute() {
  const defaultSource = useSettingsStore((s) => s.defaultSearchSource);
  const visibleSources = useSettingsStore((s) => s.visibleSources);
  const resultsPerPage = useSettingsStore((s) => s.resultsPerPage);

  const sourceOptions = useMemo(
    () => getVisibleSources(visibleSources, SOURCE_INFOS),
    [visibleSources],
  );

  const initialSource = visibleSources.includes(defaultSource)
    ? defaultSource
    : (visibleSources[0] ?? "");

  const [searchParams, setSearchParams] = useState("");
  const debouncedQuery = useDebounce(searchParams.trim(), 300);
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
  const [sortBy, setSortBy] = useState<SortKey>("seeders");
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
    if (debouncedQuery) refetch();
  }, [debouncedQuery]);

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
      nyaaPage,
    ],
    [source, searchParams, nyaaPage],
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

  const sorted = useMemo(
    () => sortAnimeResults(data, sortBy),
    [data, sortBy],
  );
  const displayItems = useMemo(
    () => sorted?.slice(0, source === "nyaa" ? resultsPerPage : undefined),
    [sorted, source, resultsPerPage],
  );

  const handleLogout = async () => {
    try {
      await invoke("rutracker_logout");
      setRutrackerAuth(false);
    } catch {
      // silently fail
    }
  };

  const handleNekoBtLogout = async () => {
    try {
      await invoke("nekobt_logout");
      setNekoBtAuth(false);
    } catch {
      // silently fail
    }
  };

  const handleSearch = () => {
    const trimmed = searchParams.trim();
    if (!trimmed) return;
    addQuery(trimmed);
    refetch();
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
              if (e.key === "Enter") handleSearch();
            }}
          />
          <SearchHistoryDropdown
            history={searchHistory}
            show={showHistory}
            onSelect={(q) => {
              flushSync(() => {
                setSearchParams(q);
                setShowHistory(false);
              });
              refetch();
            }}
            onRemove={(q) => removeQuery(q)}
          />
        </div>
        <Button
          variant="default"
          size="icon"
          onClick={handleSearch}
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
        <SearchAuthButtons
          source={source}
          rutrackerAuth={rutrackerAuth}
          nekobtAuth={nekobtAuth}
          onLoginOpen={() => setShowLogin(true)}
          onApiModalOpen={() => setShowApiModal(true)}
          onLogout={handleLogout}
          onNekoBtLogout={handleNekoBtLogout}
        />
      </section>

      <SearchFiltersBar
        sort={sortBy}
        onChange={(v) => setSortBy(v)}
      />

      {isError && (
        <section className="windows95-text text-destructive">
          {error?.message}
        </section>
      )}

      {data && data.length > 0 && (
        <span className="windows95-text text-[10px] px-1">
          {source === "nyaa" || source === "nekobt"
            ? `Стр. ${nyaaPage} · ${displayItems?.length ?? 0} из ${data.length} результатов (${data.length < resultsPerPage ? "все" : "есть ещё"})`
            : `${data.length} результатов`}
        </span>
      )}

      {data?.length === 0 && !isError && <span>Ничего не найдено</span>}

      {displayItems && (
        <section className="flex flex-col w-full h-full overflow-y-auto p-0.5 gap-1">
          {displayItems.map((item, index) => (
            <SearchResultItem
              key={`${item.link}-${index}`}
              item={item}
              source={source}
              loadingMagnet={loadingMagnet}
              onCopyMagnet={(i) =>
                copyMagnet(i, magnets, setMagnets, setLoadingMagnet)
              }
              onOpenMagnet={(i) =>
                openMagnet(i, magnets, setMagnets, setLoadingMagnet)
              }
              onDownload={(i) =>
                downloadMagnet(i, magnets, setMagnets, setLoadingMagnet)
              }
              onOpenLink={async (i) => {
                try {
                  await openUrl(i.link);
                } catch {}
              }}
            />
          ))}
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
              disabled={(data?.length ?? 0) < resultsPerPage || isLoading}
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
