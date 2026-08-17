import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { useEffect, useState, useMemo, useDeferredValue } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { SOURCE_INFOS } from "@/config/search.config";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
import { useUnifiedIndexSuggestions } from "@/hooks/unified.index.hook";
import {
  getInlineCompletion,
  getSearchSuggestions,
} from "@/lib/search.suggestions";
import { copyMagnet, openMagnet, downloadMagnet } from "@/lib/magnet.utils";
import {
  sortAnimeResults,
  filterAnimeResults,
  getVisibleSources,
} from "@/lib/search.logic";
import SearchAuthButtons from "@/routes/components/search/auth.search";
import TorrentDetailsModal from "@/routes/components/search/details.search";
import SearchFiltersBar from "@/routes/components/search/filters.search";
import SearchFiltersModal from "@/routes/components/search/modal.filters";
import NekoBtApiModal from "@/routes/components/search/nekobt.search";
import SearchResultItem from "@/routes/components/search/result.search";
import RutrackerLoginModal from "@/routes/components/search/rutracker.search";
import EraiLoginModal from "@/routes/components/search/erai.search";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime, Source } from "@/types";
import type { SearchFilters } from "@/types/search";

function SearchRoute() {
  const defaultSource = useSettingsStore((s) => s.defaultSearchSource);
  const visibleSources = useSettingsStore((s) => s.visibleSources);
  const resultsPerPage = useSettingsStore((s) => s.resultsPerPage);
  const anilistSuggestionBoost = useSettingsStore(
    (s) => s.anilistSuggestionBoost
  );

  const sourceOptions = useMemo(
    () => getVisibleSources(visibleSources, SOURCE_INFOS),
    [visibleSources]
  );

  const initialSource = visibleSources.includes(defaultSource)
    ? defaultSource
    : (visibleSources[0] ?? "");

  const [searchParams, setSearchParams] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchRequest, setSearchRequest] = useState(0);
  const [source, setSource] = useState<Source>(initialSource as Source);
  const queryClient = useQueryClient();
  const [showLogin, setShowLogin] = useState(false);
  const [showEraiLogin, setShowEraiLogin] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [magnets, setMagnets] = useState<Record<string, string>>({});
  const [loadingMagnet, setLoadingMagnet] = useState<Record<string, boolean>>(
    {}
  );
  const [nyaaPage, setNyaaPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const { t } = useI18n();
  const [selectedTorrent, setSelectedTorrent] = useState<{
    item: Anime;
    source: Source;
  } | null>(null);

  const {
    sortBy,
    sortDirection,
    filters,
    setSortBy,
    setSortDirection,
    setFilters,
    resetFilters,
    history,
    queryStats,
    suggestionStats,
    animeIndex,
    animeProfileId,
    addQuery,
    recordSuggestion,
    recordSuggestionIgnored,
    removeQuery,
    crossSearchQuery,
    setCrossSearchQuery,
  } = useSearchStore((state) => state);

  const { data: sessions } = useQuery({
    queryKey: ["search_sessions"],
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        invoke<boolean>("check_rutracker_session").catch(() => false),
        invoke<boolean>("check_nekobt_session").catch(() => false),
        invoke<boolean>("check_erai_session").catch(() => false),
      ]);
      return { rutracker, nekobt, erai };
    },
    staleTime: 5 * 60 * 1000,
  });

  const rutrackerAuth = sessions?.rutracker ?? false;
  const nekobtAuth = sessions?.nekobt ?? false;
  const eraiAuth = sessions?.erai ?? false;

  useEffect(() => {
    if (!visibleSources.includes(source) && visibleSources.length > 0) {
      setSource(visibleSources[0] as Source);
      setNyaaPage(1);
    }
  }, [visibleSources, source]);

  const isPagedSource =
    source === "nyaa" || source === "nekobt" || source === "sukebei";
  const queryKey = useMemo(
    () =>
      [
        "animeScraper",
        source,
        submittedQuery,
        searchRequest,
        nyaaPage,
        sortBy,
        sortDirection,
      ] as const,
    [source, submittedQuery, searchRequest, nyaaPage, sortBy, sortDirection]
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Anime[]> => {
      if (source === "rutracker") {
        return await invoke<Anime[]>("search_rutracker", {
          query: submittedQuery,
        });
      }
      if (source === "nyaa") {
        return await invoke<Anime[]>("search_nyaa", {
          query: submittedQuery,
          page: nyaaPage,
          sort: sortBy,
          order: sortDirection,
        });
      }
      if (source === "sukebei") {
        return await invoke<Anime[]>("search_sukebei", {
          query: submittedQuery,
          page: nyaaPage,
          sort: sortBy,
          order: sortDirection,
        });
      }
      if (source === "nekobt") {
        return await invoke<Anime[]>("search_nekobt", {
          query: submittedQuery,
          page: nyaaPage,
        });
      }
      return await invoke<Anime[]>("search_erairaws", {
        query: submittedQuery,
      });
    },
    enabled: Boolean(submittedQuery),
  });

  useEffect(() => {
    if (!isError || source !== "rutracker") return;
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    if (!message.trim().startsWith("blocked:")) return;
    queryClient.setQueryData<{ rutracker: boolean; nekobt: boolean }>(
      ["search_sessions"],
      (current) => (current ? { ...current, rutracker: false } : current)
    );
  }, [error, isError, queryClient, source]);

  useEffect(() => {
    setMagnets({});
    setLoadingMagnet({});
  }, [source, submittedQuery, searchRequest, nyaaPage, sortBy, sortDirection]);

  useEffect(() => {
    if (crossSearchQuery) {
      const query = crossSearchQuery.trim();
      setSearchParams(crossSearchQuery);
      setSubmittedQuery(query);
      setSearchRequest((request) => request + 1);
      setCrossSearchQuery(null);
    }
  }, [crossSearchQuery, setCrossSearchQuery]);

  const serverSideSort = source === "nyaa" || source === "sukebei";

  const filtered = useMemo(
    () => filterAnimeResults(data, filters),
    [data, filters]
  );

  const sorted = useMemo(
    () =>
      serverSideSort
        ? filtered
        : sortAnimeResults(filtered, sortBy, sortDirection),
    [filtered, sortBy, sortDirection, serverSideSort]
  );

  const displayItems = useMemo(
    () => (isPagedSource ? sorted?.slice(0, resultsPerPage) : sorted),
    [sorted, isPagedSource, resultsPerPage]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.minSeeders > 0) count++;
    if (filters.hasMagnet) count++;
    if (filters.quality !== "all") count++;
    if (filters.language !== "all") count++;
    if (filters.sizeMin > 0 || filters.sizeMax > 0) count++;
    if (filters.codec !== "all") count++;
    return count;
  }, [filters]);

  const handleLogout = async () => {
    try {
      await invoke("rutracker_logout");
      queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
    } catch {}
  };

  const handleNekoBtLogout = async () => {
    try {
      await invoke("nekobt_logout");
      queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
    } catch {}
  };

  const handleEraiLogout = async () => {
    try {
      await invoke("erai_logout");
      queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
    } catch {}
  };

  const deferredSearch = useDeferredValue(searchParams);
  const backendSuggestions = useUnifiedIndexSuggestions(
    deferredSearch,
    "torrent",
    8
  );
  const suggestions = useMemo(
    () =>
      getSearchSuggestions(deferredSearch, {
        animeEnabled: animeProfileId !== null,
        animeIndex,
        backendSuggestions,
        history,
        queryStats,
        suggestionStats,
        scope: "torrent",
        anilistBoost: anilistSuggestionBoost,
        limit: 8,
      }),
    [
      anilistSuggestionBoost,
      animeProfileId,
      backendSuggestions,
      history,
      queryStats,
      deferredSearch,
      suggestionStats,
    ]
  );
  const inlineCompletion = useMemo(
    () => getInlineCompletion(deferredSearch, suggestions),
    [deferredSearch, suggestions]
  );

  const handleSearch = () => {
    const trimmed = searchParams.trim();
    if (!trimmed) return;
    if (
      inlineCompletion &&
      trimmed.toLocaleLowerCase() !== inlineCompletion.toLocaleLowerCase()
    ) {
      recordSuggestionIgnored(inlineCompletion);
    }
    addQuery(trimmed, "torrent");
    setSubmittedQuery(trimmed);
    setSearchRequest((request) => request + 1);
  };

  return (
    <main className="flex h-full w-full flex-col gap-1">
      <section className="ui-toolbar ui-panel w-full flex-row">
        <div className="relative flex flex-1 items-center justify-center gap-1">
          <InlineAutocompleteInput
            placeholder={t("search.findPlaceholder")}
            value={searchParams}
            completion={inlineCompletion}
            suggestions={suggestions}
            history={history}
            className="h-9 font-bold"
            onChange={(e) => setSearchParams(e.target.value)}
            onAcceptCompletion={(value) => {
              recordSuggestion(value);
              setSearchParams(value);
            }}
            onDismissCompletion={() => {
              if (inlineCompletion) recordSuggestionIgnored(inlineCompletion);
            }}
            onRemoveHistory={removeQuery}
            onKeyDown={enterSubmit(handleSearch)}
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
          className="h-9 max-w-30 min-w-30"
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
          eraiAuth={eraiAuth}
          onLoginOpen={() => setShowLogin(true)}
          onApiModalOpen={() => setShowApiModal(true)}
          onEraiLoginOpen={() => setShowEraiLogin(true)}
          onLogout={handleLogout}
          onNekoBtLogout={handleNekoBtLogout}
          onEraiLogout={handleEraiLogout}
        />
      </section>

      <SearchFiltersBar
        sort={sortBy}
        direction={sortDirection}
        activeFilterCount={activeFilterCount}
        onSortChange={setSortBy}
        onDirectionChange={() =>
          setSortDirection(sortDirection === "desc" ? "asc" : "desc")
        }
        onOpenFilters={() => setShowFilters(true)}
      />

      {showFilters && (
        <SearchFiltersModal
          open={showFilters}
          filters={filters}
          onApply={(f: SearchFilters) => setFilters(f)}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {isError && (
        <section
          className="windows95-border bg-surface text-destructive flex items-center gap-2 px-2 py-1"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span className="windows95-text flex-1 truncate">
            {error instanceof Error
              ? error.message
              : String(error ?? t("search.error"))}
          </span>
          <Button className="h-5" onClick={() => refetch()}>
            {t("search.retry")}
          </Button>
        </section>
      )}

      {data && data.length > 0 && (
        <span className="windows95-text px-1 text-[10px]">
          {isPagedSource
            ? t("search.pageResults", {
                page: nyaaPage,
                shown: displayItems?.length ?? 0,
                total: data.length,
                status:
                  data.length < resultsPerPage
                    ? t("search.allShown")
                    : t("search.moreAvailable"),
              })
            : t("search.resultsCount", { count: data.length })}
        </span>
      )}

      {data?.length === 0 && !isError && (
        <section className="ui-empty-state flex-1 flex-col">
          <Inbox className="size-8" />
          <span className="windows95-text">{t("search.nothingFound")}</span>
          <span className="windows95-text text-[10px]">
            {t("search.tryDifferent")}
          </span>
        </section>
      )}

      {displayItems && (
        <section className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-0.5">
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
              onOpenDetails={(i) => setSelectedTorrent({ item: i, source })}
            />
          ))}
        </section>
      )}

      {isPagedSource && displayItems && displayItems.length > 0 && (
        <section className="flex items-center justify-end gap-1 py-1">
          <span className="windows95-text mr-1">
            {t("search.page", { page: nyaaPage })}
          </span>
          <Button
            size="icon"
            className="size-5"
            disabled={nyaaPage <= 1 || isLoading}
            onClick={() => setNyaaPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-3" />
          </Button>
          <Button
            size="icon"
            className="size-5"
            disabled={(data?.length ?? 0) < resultsPerPage || isLoading}
            onClick={() => setNyaaPage((p) => p + 1)}
          >
            <ChevronRight className="size-3" />
          </Button>
        </section>
      )}

      {showLogin && (
        <RutrackerLoginModal
          setRutrackerAuth={() =>
            queryClient.invalidateQueries({ queryKey: ["search_sessions"] })
          }
          setShowLogin={setShowLogin}
        />
      )}
      {showEraiLogin && (
        <EraiLoginModal
          setEraiAuth={() =>
            queryClient.invalidateQueries({ queryKey: ["search_sessions"] })
          }
          setShowLogin={setShowEraiLogin}
        />
      )}
      {showApiModal && (
        <NekoBtApiModal
          setNekoBtAuth={() =>
            queryClient.invalidateQueries({ queryKey: ["search_sessions"] })
          }
          setShowApiModal={setShowApiModal}
        />
      )}
      {selectedTorrent && (
        <TorrentDetailsModal
          item={selectedTorrent.item}
          source={selectedTorrent.source}
          magnets={magnets}
          loadingMagnet={loadingMagnet}
          onClose={() => setSelectedTorrent(null)}
          onCopyMagnet={(item) =>
            copyMagnet(item, magnets, setMagnets, setLoadingMagnet)
          }
          onOpenMagnet={(item) =>
            openMagnet(item, magnets, setMagnets, setLoadingMagnet)
          }
          onDownload={async (item) => {
            setSelectedTorrent(null);
            await downloadMagnet(item, magnets, setMagnets, setLoadingMagnet);
          }}
        />
      )}
    </main>
  );
}

export default SearchRoute;
