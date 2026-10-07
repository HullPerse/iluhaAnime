import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { SOURCE_INFOS } from "@/config/search/sources.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useSearchSessions } from "@/hooks/search/sessions.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { countActiveFilters } from "@/lib/search/filters.utils";
import {
  filterAnimeResults,
  getVisibleSources,
  sortAnimeResults,
  dedupAnimeResults,
} from "@/lib/search/results.utils";
import {
  isPagedSearchSource,
  resolveInitialSource,
  serverSideSortSource,
} from "@/lib/search/route.utils";
import { suggestSpelling } from "@/lib/search/suggestions.utils";
import { parseTorrentTags, torrentTagsToFilters } from "@/lib/search/torrentTags.utils";
import { useCell } from "@/lib/state/signal.hook";
import { copyMagnet, downloadMagnet, openMagnet } from "@/lib/torrent/magnet.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import {
  resetSearchFilters as resetFilters,
  searchAtoms,
  setCrossSearchQuery,
  setSearchFilters as setFilters,
  setSearchSortBy as setSortBy,
  setSearchSortDirection as setSortDirection,
} from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { Source, SearchQueryController, SelectedSearchTorrent } from "@/types/search";
import type { Anime } from "@/types/torrent";

export function useSearchQuery(): SearchQueryController {
  const defaultSource = useCell(settingsAtoms.defaultSearchSource);
  const visibleSources = useCell(settingsAtoms.visibleSources);
  const resultsPerPage = useCell(settingsAtoms.resultsPerPage);
  const searchProxyUrls = useCell(settingsAtoms.searchProxyUrls);
  const searchSymSpellEnabled = useCell(settingsAtoms.searchSymSpellEnabled);

  const sourceOptions = useMemo(
    () => getVisibleSources(visibleSources, SOURCE_INFOS),
    [visibleSources]
  );

  const initialSource = resolveInitialSource(visibleSources, defaultSource) as Source;

  const [searchParams, setSearchParams] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchRequest, setSearchRequest] = useState(0);
  const [source, setSource] = useState<Source>(initialSource as Source);
  const [lastDefaultSource, setLastDefaultSource] = useState(defaultSource);
  const queryClient = useQueryClient();
  const [showLogin, setShowLogin] = useState(false);
  const [showEraiLogin, setShowEraiLogin] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [magnets, setMagnets] = useState<Record<string, string>>({});
  const [loadingMagnet, setLoadingMagnet] = useState<Record<string, boolean>>({});
  const [nyaaPage, setNyaaPage] = useState(1);
  const [maxPage, setMaxPage] = useState(Number.POSITIVE_INFINITY);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTorrent, setSelectedTorrent] = useState<SelectedSearchTorrent | null>(null);
  if (lastDefaultSource !== defaultSource) {
    setLastDefaultSource(defaultSource);
    setSource(resolveInitialSource(visibleSources, defaultSource) as Source);
    setSubmittedQuery("");
    setNyaaPage(1);
    setMaxPage(Number.POSITIVE_INFINITY);
  }

  const sortBy = useCell(searchAtoms.sortBy);
  const sortDirection = useCell(searchAtoms.sortDirection);
  const filters = useCell(searchAtoms.filters);

  const crossSearchQuery = useCell(searchAtoms.crossSearchQuery);

  const { rutrackerAuth, nekobtAuth, eraiAuth } = useSearchSessions();

  useEffect(() => {
    if (!visibleSources.includes(source) && visibleSources.length > 0) {
      setSource(visibleSources[0] as Source);
      setNyaaPage(1);
    }
  }, [visibleSources, source]);

  const isPagedSource = isPagedSearchSource(source);
  const serverSideSort = serverSideSortSource(source);
  const queryKey = useMemo(
    () =>
      queryKeys.torrentSearch(
        source,
        submittedQuery,
        searchRequest,
        nyaaPage,
        serverSideSort ? sortBy : null,
        serverSideSort ? sortDirection : null,
        searchProxyUrls[source]
      ),
    [
      source,
      submittedQuery,
      searchRequest,
      nyaaPage,
      sortBy,
      sortDirection,
      searchProxyUrls,
      serverSideSort,
    ]
  );

  const fetchBySource = (): Promise<Anime[]> =>
    torrentApi.searchBySource(source, {
      query: submittedQuery,
      page: nyaaPage,
      sort: sortBy,
      order: sortDirection,
    });

  const { data, isLoading, isError, error, refetch } = useAppQuery("slow", {
    queryKey,
    queryFn: fetchBySource,
    enabled: Boolean(submittedQuery),
    retry: false,
    placeholderData: keepPreviousData,
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
    if (!submittedQuery || !data || data.length > 0 || nyaaPage <= 1) return;
    const steppedBack = nyaaPage - 1;
    setMaxPage((current) => Math.min(current, steppedBack));
    setNyaaPage((page) => (page <= steppedBack ? page : steppedBack));
  }, [data, nyaaPage, submittedQuery]);

  useEffect(() => {
    if (crossSearchQuery) {
      const query = crossSearchQuery.trim();
      setSearchParams(crossSearchQuery);
      setSubmittedQuery(query);
      setSearchRequest((request) => request + 1);
      setMaxPage(Number.POSITIVE_INFINITY);
      setCrossSearchQuery(null);
    }
  }, [crossSearchQuery]);

  const filtered = useMemo(() => filterAnimeResults(data, filters), [data, filters]);

  const sorted = useMemo(
    () => (serverSideSort ? filtered : sortAnimeResults(filtered, sortBy, sortDirection)),
    [filtered, sortBy, sortDirection, serverSideSort]
  );

  const deduped = useMemo(() => dedupAnimeResults(sorted), [sorted]);

  const displayItems = useMemo(
    () => (isPagedSource ? deduped?.slice(0, resultsPerPage) : deduped),
    [deduped, isPagedSource, resultsPerPage]
  );

  const pageFull = isPagedSource && (data?.length ?? 0) >= resultsPerPage && nyaaPage < maxPage;

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const handleLogout = async () => {
    const [, error] = await attempt(torrentApi.rutrackerLogout());
    if (error) console.warn("rutracker_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
  };

  const handleNekoBtLogout = async () => {
    const [, error] = await attempt(torrentApi.nekobtLogout());
    if (error) console.warn("nekobt_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
  };

  const handleEraiLogout = async () => {
    const [, error] = await attempt(torrentApi.eraiLogout());
    if (error) console.warn("erai_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
  };

  const onAuthenticated = () => queryClient.invalidateQueries({ queryKey: ["search_sessions"] });

  const changeSource = (value: string) => {
    setSource(value as Source);
    setNyaaPage(1);
    setMaxPage(Number.POSITIVE_INFINITY);
    setSubmittedQuery("");
    resetFilters();
  };
  const resetSearch = () => {
    setSearchParams("");
    setSubmittedQuery("");
    setNyaaPage(1);
    setMaxPage(Number.POSITIVE_INFINITY);
    setSelectedTorrent(null);
    queryClient.removeQueries({ queryKey: ["animeScraper"] });
  };

  const toggleSortDirection = () => setSortDirection(sortDirection === "desc" ? "asc" : "desc");

  const copyMagnetFor = (item: Anime) => copyMagnet(item, magnets, setMagnets, setLoadingMagnet);
  const openMagnetFor = (item: Anime) => openMagnet(item, magnets, setMagnets, setLoadingMagnet);
  const downloadMagnetFor = (item: Anime) =>
    downloadMagnet(item, magnets, setMagnets, setLoadingMagnet, source);

  const field = useSearchField({
    scope: "torrent",
    query: searchParams,
    setQuery: setSearchParams,
    onSubmit: (query) => {
      applySubmitQuery(query);
    },
  });
  const animeIndex = useCell(searchAtoms.animeIndex);
  const searchHistory = useCell(searchAtoms.history);
  const didYouMean = useMemo(() => {
    if (!submittedQuery || isLoading || (data?.length ?? 0) > 0) return null;
    return suggestSpelling(submittedQuery, {
      history: searchHistory,
      animeIndex,
      symSpell: searchSymSpellEnabled,
    });
  }, [submittedQuery, isLoading, data, searchHistory, animeIndex, searchSymSpellEnabled]);
  const applySubmitQuery = useCallback(
    (query: string) => {
      const { cleanQuery, tags } = parseTorrentTags(query);
      const text = cleanQuery || query.trim();
      if (tags.length > 0) {
        const mapped = torrentTagsToFilters(tags);
        if (Object.keys(mapped.filters).length > 0) setFilters(mapped.filters);
        setSearchParams(text);
        if (mapped.source) {
          setSource(mapped.source);
          setNyaaPage(1);
        }
      }
      setSubmittedQuery(text);
      setSearchRequest((request) => request + 1);
      setMaxPage(Number.POSITIVE_INFINITY);
    },
    []
  );

  const applyDidYouMean = () => {
    if (!didYouMean) return;
    setSearchParams(didYouMean);
    applySubmitQuery(didYouMean);
  };

  return {
    source,
    sourceOptions,
    isLoading,
    searchParams,
    submittedQuery,
    didYouMean,
    applyDidYouMean,
    field,
    handleSearch: field.handleSubmit,
    resetSearch,
    changeSource,
    sortBy,
    sortDirection,
    setSortBy,
    toggleSortDirection,
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
    showFilters,
    setShowFilters,
    isError,
    error,
    refetch,
    data,
    displayItems,
    isPagedSource,
    pageFull,
    nyaaPage,
    setNyaaPage,
    resultsPerPage,
    rutrackerAuth,
    nekobtAuth,
    eraiAuth,
    showLogin,
    showEraiLogin,
    showApiModal,
    setShowLogin,
    setShowEraiLogin,
    setShowApiModal,
    handleLogout,
    handleNekoBtLogout,
    handleEraiLogout,
    onAuthenticated,
    magnets,
    loadingMagnet,
    copyMagnetFor,
    openMagnetFor,
    downloadMagnetFor,
    selectedTorrent,
    setSelectedTorrent,
  };
}
