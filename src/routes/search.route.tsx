import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { SOURCE_INFOS } from "@/config/search/sources.config";
import { useSearchField } from "@/hooks/search/field.hook";
import { useSearchSessions } from "@/hooks/search/sessions.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { countActiveFilters } from "@/lib/search/filters.utils";
import {
  filterAnimeResults,
  getVisibleSources,
  sortAnimeResults,
} from "@/lib/search/results.utils";
import {
  isPagedSearchSource,
  resolveInitialSource,
  serverSideSortSource,
} from "@/lib/search/route.utils";
import { copyMagnet, openMagnet, downloadMagnet } from "@/lib/torrent/magnet.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import SearchAuthButtons from "@/routes/components/search/auth.search";
import TorrentDetailsModal from "@/routes/components/search/details/modal.details";
import SearchErrorBar from "@/routes/components/search/error.search";
import { SearchFilterChips } from "@/routes/components/search/filterChips.search";
import SearchFiltersBar from "@/routes/components/search/filters/bar.filters";
import SearchFiltersModal from "@/routes/components/search/filters/modal.filters";
import SearchPager from "@/routes/components/search/pager.search";
import SearchResultItem from "@/routes/components/search/result.search";
import SearchSessionModals from "@/routes/components/search/sessions.search";
import SearchResultsSummary from "@/routes/components/search/summary.search";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime, Source } from "@/types";
import type { SearchFilters } from "@/types/search";

function SearchRoute() {
  const defaultSource = useSettingsStore((s) => s.defaultSearchSource);
  const visibleSources = useSettingsStore((s) => s.visibleSources);
  const resultsPerPage = useSettingsStore((s) => s.resultsPerPage);

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

  const sortBy = useSearchStore((s) => s.sortBy);
  const sortDirection = useSearchStore((s) => s.sortDirection);
  const filters = useSearchStore((s) => s.filters);
  const setSortBy = useSearchStore((s) => s.setSortBy);
  const setSortDirection = useSearchStore((s) => s.setSortDirection);
  const setFilters = useSearchStore((s) => s.setFilters);
  const resetFilters = useSearchStore((s) => s.resetFilters);

  const crossSearchQuery = useSearchStore((s) => s.crossSearchQuery);
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);

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
    if (source === "rutracker") return invokeTyped<Anime[]>("search_rutracker", base as never);
    if (source === "nyaa") return invokeTyped<Anime[]>("search_nyaa", paged as never);
    if (source === "sukebei") return invokeTyped<Anime[]>("search_sukebei", paged as never);
    if (source === "nekobt")
      return invokeTyped<Anime[]>("search_nekobt", { ...base, page: nyaaPage } as never);
    return invokeTyped<Anime[]>("search_erairaws", base as never);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchBySource,
    enabled: Boolean(submittedQuery),
    retry: false,
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
      await invokeTyped("rutracker_logout");
      queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
    } catch (error) {
      console.warn("rutracker_logout failed", error);
    }
  };

  const handleNekoBtLogout = async () => {
    try {
      await invokeTyped("nekobt_logout");
      queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
    } catch (error) {
      console.warn("nekobt_logout failed", error);
    }
  };

  const handleEraiLogout = async () => {
    try {
      await invokeTyped("erai_logout");
      queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
    } catch (error) {
      console.warn("erai_logout failed", error);
    }
  };

  const field = useSearchField({
    scope: "torrent",
    query: searchParams,
    setQuery: setSearchParams,

    onSubmit: (query) => {
      setSubmittedQuery(query);
      setSearchRequest((request) => request + 1);
    },
  });
  const handleSearch = field.handleSubmit;

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <section className="ui-toolbar ui-panel w-full flex-row">
        <div className="relative flex flex-1 items-center justify-center gap-1">
          <InlineAutocompleteInput
            placeholder={t("search.find.placeholder")}
            className="h-9 font-bold"
            {...field.inputProps}
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
      <SearchFilterChips query={searchParams} filters={filters} onChange={setFilters} />

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
              onDownload={(i) => downloadMagnet(i, magnets, setMagnets, setLoadingMagnet, source)}
              onOpenLink={async (i) => {
                try {
                  await openUrl(i.link);
                } catch (error) {
                  console.warn("openUrl failed", error);
                }
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
            await downloadMagnet(
              item,
              magnets,
              setMagnets,
              setLoadingMagnet,
              selectedTorrent.source
            );
          }}
        />
      )}
    </div>
  );
}

export default SearchRoute;
