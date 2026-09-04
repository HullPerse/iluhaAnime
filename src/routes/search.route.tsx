import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { SOURCE_INFOS } from "@/config/search.config";
import { useAutocomplete } from "@/hooks/autocomplete.hook";
import { useSearchSessions } from "@/hooks/searchSessions.hook";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
import { copyMagnet, openMagnet, downloadMagnet } from "@/lib/magnet.utils";
import { filterAnimeResults, getVisibleSources, sortAnimeResults } from "@/lib/search.logic";
import {
  isPagedSearchSource,
  resolveInitialSource,
  serverSideSortSource,
} from "@/lib/searchRoute.utils";
import SearchAuthButtons from "@/routes/components/search/auth.search";
import TorrentDetailsModal from "@/routes/components/search/details.search";
import SearchEmptyState from "@/routes/components/search/empty.search";
import SearchErrorBar from "@/routes/components/search/error.search";
import SearchFiltersBar from "@/routes/components/search/filters.search";
import SearchFiltersModal from "@/routes/components/search/modal.filters";
import SearchPager from "@/routes/components/search/pager.search";
import SearchResultItem from "@/routes/components/search/result.search";
import SearchSessionModals from "@/routes/components/search/sessions.search";
import SearchResultsSummary from "@/routes/components/search/summary.search";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime, Source } from "@/types";
import type { SearchFilters } from "@/types/search";

function countActiveFilters(f: SearchFilters): number {
  let count = 0;
  if (f.minSeeders > 0) count++;
  if (f.hasMagnet) count++;
  if (f.quality !== "all") count++;
  if (f.language !== "all") count++;
  if (f.sizeMin > 0 || f.sizeMax > 0) count++;
  if (f.codec !== "all") count++;
  return count;
}

function SearchRoute() {
  const defaultSource = useSettingsStore((s) => s.defaultSearchSource);
  const visibleSources = useSettingsStore((s) => s.visibleSources);
  const resultsPerPage = useSettingsStore((s) => s.resultsPerPage);
  const anilistSuggestionBoost = useSettingsStore((s) => s.anilistSuggestionBoost);

  const sourceOptions = useMemo(
    () => getVisibleSources(visibleSources, SOURCE_INFOS),
    [visibleSources]
  );

  const initialSource = resolveInitialSource(visibleSources, defaultSource) as Source;

  const [searchParams, setSearchParams] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchRequest, setSearchRequest] = useState(0);
  const [source, setSource] = useState<Source>(initialSource as Source);
  const queryClient = useQueryClient();
  const [showLogin, setShowLogin] = useState(false);
  const [showEraiLogin, setShowEraiLogin] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [magnets, setMagnets] = useState<Record<string, string>>({});
  const [loadingMagnet, setLoadingMagnet] = useState<Record<string, boolean>>({});
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

  const { rutrackerAuth, nekobtAuth, eraiAuth } = useSearchSessions();

  const searchProxyUrls = useSettingsStore((s) => s.searchProxyUrls);

  useEffect(() => {
    if (!visibleSources.includes(source) && visibleSources.length > 0) {
      setSource(visibleSources[0] as Source);
      setNyaaPage(1);
    }
  }, [visibleSources, source]);

  const isPagedSource = isPagedSearchSource(source);
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
        searchProxyUrls[source],
      ] as const,
    [source, submittedQuery, searchRequest, nyaaPage, sortBy, sortDirection, searchProxyUrls]
  );

  const fetchBySource = async (): Promise<Anime[]> => {
    const proxyUrl = searchProxyUrls[source] || undefined;
    const base = { query: submittedQuery, proxyUrl } as Record<string, unknown>;
    const paged = { ...base, page: nyaaPage, sort: sortBy, order: sortDirection };
    if (source === "rutracker") return invoke<Anime[]>("search_rutracker", base as never);
    if (source === "nyaa") return invoke<Anime[]>("search_nyaa", paged as never);
    if (source === "sukebei") return invoke<Anime[]>("search_sukebei", paged as never);
    if (source === "nekobt")
      return invoke<Anime[]>("search_nekobt", { ...base, page: nyaaPage } as never);
    return invoke<Anime[]>("search_erairaws", base as never);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchBySource,
    enabled: Boolean(submittedQuery),
  });

  useEffect(() => {
    if (!isError || source !== "rutracker") return;
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!message.trim().startsWith("blocked:")) return;
    queryClient.setQueryData<{ rutracker: boolean; nekobt: boolean }>(
      ["search_sessions"],
      (current) => (current ? { ...current, rutracker: false } : current)
    );
  }, [error, isError, queryClient, source]);

  useEffect(() => {
    setMagnets({});
    setLoadingMagnet({});
  }, []);

  useEffect(() => {
    if (crossSearchQuery) {
      const query = crossSearchQuery.trim();
      setSearchParams(crossSearchQuery);
      setSubmittedQuery(query);
      setSearchRequest((request) => request + 1);
      setCrossSearchQuery(null);
    }
  }, [crossSearchQuery, setCrossSearchQuery]);

  const serverSideSort = serverSideSortSource(source);

  const filtered = useMemo(() => filterAnimeResults(data, filters), [data, filters]);

  const sorted = useMemo(
    () => (serverSideSort ? filtered : sortAnimeResults(filtered, sortBy, sortDirection)),
    [filtered, sortBy, sortDirection, serverSideSort]
  );

  const displayItems = useMemo(
    () => (isPagedSource ? sorted?.slice(0, resultsPerPage) : sorted),
    [sorted, isPagedSource, resultsPerPage]
  );

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

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

  const { suggestions, inlineCompletion } = useAutocomplete({
    query: searchParams,
    scope: "torrent",
    history,
    queryStats,
    suggestionStats,
    animeIndex,
    animeProfileId,
    anilistBoost: anilistSuggestionBoost,
  });

  const handleSearch = () => {
    const trimmed = searchParams.trim();
    if (!trimmed) return;
    if (inlineCompletion && trimmed.toLocaleLowerCase() !== inlineCompletion.toLocaleLowerCase()) {
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
            placeholder={t("search.find.placeholder")}
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
          {isLoading ? <SmallLoader /> : <Search className="pointer-events-none" />}
        </Button>
        <span className="ui-toolbar-separator" aria-hidden />
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
        onDirectionChange={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}
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

      {isError && <SearchErrorBar error={error} onRetry={() => refetch()} />}

      {data && data.length > 0 && (
        <SearchResultsSummary
          data={data}
          shown={displayItems?.length ?? 0}
          isPagedSource={isPagedSource}
          page={nyaaPage}
          resultsPerPage={resultsPerPage}
        />
      )}

      <SearchEmptyState visible={data?.length === 0 && !isError} />

      {displayItems && (
        <section className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-0.5">
          {displayItems.map((item, index) => (
            <SearchResultItem
              key={`${item.link}-${index}`}
              item={item}
              source={source}
              loadingMagnet={loadingMagnet}
              onCopyMagnet={(i) => copyMagnet(i, magnets, setMagnets, setLoadingMagnet)}
              onOpenMagnet={(i) => openMagnet(i, magnets, setMagnets, setLoadingMagnet)}
              onDownload={(i) => downloadMagnet(i, magnets, setMagnets, setLoadingMagnet)}
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
        <SearchPager
          page={nyaaPage}
          pageFull={(data?.length ?? 0) >= resultsPerPage}
          isLoading={isLoading}
          onPageChange={setNyaaPage}
        />
      )}

      <SearchSessionModals
        showLogin={showLogin}
        showEraiLogin={showEraiLogin}
        showApiModal={showApiModal}
        setShowLogin={setShowLogin}
        setShowEraiLogin={setShowEraiLogin}
        setShowApiModal={setShowApiModal}
        onAuthenticated={() => queryClient.invalidateQueries({ queryKey: ["search_sessions"] })}
      />
      {selectedTorrent && (
        <TorrentDetailsModal
          item={selectedTorrent.item}
          source={selectedTorrent.source}
          magnets={magnets}
          loadingMagnet={loadingMagnet}
          onClose={() => setSelectedTorrent(null)}
          onCopyMagnet={(item) => copyMagnet(item, magnets, setMagnets, setLoadingMagnet)}
          onOpenMagnet={(item) => openMagnet(item, magnets, setMagnets, setLoadingMagnet)}
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
