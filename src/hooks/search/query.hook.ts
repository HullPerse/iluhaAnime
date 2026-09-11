import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { SOURCE_INFOS } from "@/config/search/sources.config";
import { useSearchField } from "@/hooks/search/field.hook";
import { useSearchSessions } from "@/hooks/search/sessions.hook";
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
import { copyMagnet, downloadMagnet, openMagnet } from "@/lib/torrent/magnet.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime } from "@/types/torrent";
import type { Source, SearchQueryController, SelectedSearchTorrent } from "@/types/search";

export function useSearchQuery(): SearchQueryController {
  const defaultSource = useSettingsStore((s) => s.defaultSearchSource);
  const visibleSources = useSettingsStore((s) => s.visibleSources);
  const resultsPerPage = useSettingsStore((s) => s.resultsPerPage);
  const searchProxyUrls = useSettingsStore((s) => s.searchProxyUrls);

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
  const [selectedTorrent, setSelectedTorrent] = useState<SelectedSearchTorrent | null>(null);

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
    if (source === "rutracker") return invokeTyped<Anime[]>("search_rutracker", base);
    if (source === "nyaa") return invokeTyped<Anime[]>("search_nyaa", paged);
    if (source === "sukebei") return invokeTyped<Anime[]>("search_sukebei", paged);
    if (source === "nekobt")
      return invokeTyped<Anime[]>("search_nekobt", { ...base, page: nyaaPage });
    return invokeTyped<Anime[]>("search_erairaws", base);
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
    const [, error] = await attempt(invokeTyped("rutracker_logout"));
    if (error) console.warn("rutracker_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
  };

  const handleNekoBtLogout = async () => {
    const [, error] = await attempt(invokeTyped("nekobt_logout"));
    if (error) console.warn("nekobt_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
  };

  const handleEraiLogout = async () => {
    const [, error] = await attempt(invokeTyped("erai_logout"));
    if (error) console.warn("erai_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: ["search_sessions"] });
  };

  const onAuthenticated = () => queryClient.invalidateQueries({ queryKey: ["search_sessions"] });

  const changeSource = (value: string) => {
    setSource(value as Source);
    setNyaaPage(1);
  };
  const resetSearch = () => {
    setSearchParams("");
    setSubmittedQuery("");
    setNyaaPage(1);
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
      setSubmittedQuery(query);
      setSearchRequest((request) => request + 1);
    },
  });

  return {
    source,
    sourceOptions,
    isLoading,
    searchParams,
    submittedQuery,
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
