import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { SOURCE_INFOS } from "@/config/search/searchSources.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useSearchSessions } from "@/hooks/search/sessions.hook";
import { queryKeys } from "@/lib/core/keys.utils";
import { countActiveFilters } from "@/lib/search/searchFilters.utils";
import {
  filterAnimeResults,
  getVisibleSources,
  sortAnimeResults,
  dedupAnimeResults,
} from "@/lib/core/results.utils";
import {
  isPagedSearchSource,
  resolveInitialSource,
  serverSideSortSource,
} from "@/lib/search/searchRoute.utils";
import { suggestSpellingWithReason } from "@/lib/search/searchResolve.utils";
import { parseTorrentTags, torrentTagsToFilters } from "@/lib/torrent/torrentTags.utils";
import { useCell } from "@/lib/core/signal.hook";
import { copyMagnet, downloadMagnet, openMagnet } from "@/lib/torrent/magnet.utils";
import { attempt, reportBackgroundError } from "@/lib/core/attempt.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";
import { cacheAtoms, setLastSaveDir } from "@/store/cache.store";
import {
  resetSearchFilters as resetFilters,
  searchAtoms,
  setCrossSearchQuery,
  setResultSource,
  setSearchFilters as setFilters,
  setSearchSortBy as setSortBy,
  setSearchSortDirection as setSortDirection,
} from "@/store/search.store";
import { setPresenceSearching } from "@/store/presence.store";
import { settingsAtoms } from "@/store/settings.store";
import type { Source, SearchQueryController, SelectedSearchTorrent } from "@/types/search/search";
import type { Anime } from "@/types/torrent/torrent";

export function useSearchQuery(): SearchQueryController {
  const defaultSource = useCell(settingsAtoms.defaultSearchSource);
  const visibleSources = useCell(settingsAtoms.visibleSources);
  const searchResultsPerPage = useCell(settingsAtoms.searchResultsPerPage);
  const searchProxyUrls = useCell(settingsAtoms.searchProxyUrls);
  const searchSymSpellEnabled = useCell(settingsAtoms.searchSymSpellEnabled);

  const sourceOptions = useMemo(
    () => getVisibleSources(visibleSources, SOURCE_INFOS),
    [visibleSources]
  );

  const initialSource = resolveInitialSource(visibleSources, defaultSource) as Source;

  const [searchParams, setSearchParams] = useState<string>("");
  const [submittedQuery, setSubmittedQuery] = useState<string>("");
  const [searchRequest, setSearchRequest] = useState<number>(0);
  const [source, setSource] = useState<Source>(initialSource);
  const resultSource = useCell(searchAtoms.resultSource);
  const fetchSourceRef = useRef<Source | null>(null);
  const [lastDefaultSource, setLastDefaultSource] = useState<string>(defaultSource);
  const queryClient = useQueryClient();
  const [showLogin, setShowLogin] = useState<boolean>(false);
  const [showEraiLogin, setShowEraiLogin] = useState<boolean>(false);
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [magnets, setMagnets] = useState<Record<string, string>>({});
  const [loadingMagnet, setLoadingMagnet] = useState<Record<string, boolean>>({});
  const [nyaaPage, setNyaaPage] = useState<number>(1);
  const [maxPage, setMaxPage] = useState<number>(Number.POSITIVE_INFINITY);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [selectedTorrent, setSelectedTorrent] = useState<SelectedSearchTorrent | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const batchBusyRef = useRef<boolean>(false);
  if (lastDefaultSource !== defaultSource) {
    setLastDefaultSource(defaultSource);
    setSource(resolveInitialSource(visibleSources, defaultSource) as Source);
    setSubmittedQuery("");
    setNyaaPage(1);
    setMaxPage(Number.POSITIVE_INFINITY);
  }

  useEffect(() => {
    setPresenceSearching(submittedQuery.trim().length > 0);
    return () => setPresenceSearching(false);
  }, [submittedQuery]);

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

  const fetchBySource = (): Promise<Anime[]> => {
    fetchSourceRef.current = source;
    return torrentApi.searchBySource(source, {
      query: submittedQuery,
      page: nyaaPage,
      sort: sortBy,
      order: sortDirection,
    });
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useAppQuery(
    "slow",
    {
      queryKey,
      queryFn: fetchBySource,
      enabled: Boolean(submittedQuery),
      retry: false,
      placeholderData: keepPreviousData,
    }
  );

  useEffect(() => {
    if (!isFetching && data !== undefined && fetchSourceRef.current !== null) {
      setResultSource(fetchSourceRef.current);
    }
  }, [data, isFetching]);

  useEffect(() => {
    if (!isError || source !== "rutracker") return;
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!message.trim().startsWith("blocked:")) return;
    queryClient.setQueryData<{ rutracker: boolean; nekobt: boolean }>(
      queryKeys.searchSessionsScope(),
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
    () => (isPagedSource ? deduped?.slice(0, searchResultsPerPage) : deduped),
    [deduped, isPagedSource, searchResultsPerPage]
  );

  const pageFull =
    isPagedSource && (data?.length ?? 0) >= searchResultsPerPage && nyaaPage < maxPage;

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const handleLogout = async () => {
    const [, error] = await attempt(torrentApi.rutrackerLogout());
    if (error) console.warn("rutracker_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: queryKeys.searchSessionsScope() });
  };

  const handleNekoBtLogout = async () => {
    const [, error] = await attempt(torrentApi.nekobtLogout());
    if (error) console.warn("nekobt_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: queryKeys.searchSessionsScope() });
  };

  const handleEraiLogout = async () => {
    const [, error] = await attempt(torrentApi.eraiLogout());
    if (error) console.warn("erai_logout failed", error);
    else queryClient.invalidateQueries({ queryKey: queryKeys.searchSessionsScope() });
  };

  const onAuthenticated = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.searchSessionsScope() });

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
    queryClient.removeQueries({ queryKey: queryKeys.torrentSearchScope() });
  };

  const toggleSortDirection = () => setSortDirection(sortDirection === "desc" ? "asc" : "desc");

  const copyMagnetFor = (item: Anime) => copyMagnet(item, magnets, setMagnets, setLoadingMagnet);
  const openMagnetFor = (item: Anime) => openMagnet(item, magnets, setMagnets, setLoadingMagnet);
  const downloadMagnetFor = (item: Anime) =>
    downloadMagnet(item, magnets, setMagnets, setLoadingMagnet, resultSource ?? source);

  const batchDownloadFor = useCallback(
    async (items: Anime[]) => {
      if (batchBusyRef.current || items.length === 0) return;
      batchBusyRef.current = true;
      const total = items.length;
      setBatchProgress({ done: 0, total });
      let saveDir = cacheAtoms.lastSaveDir.get();
      if (!saveDir) {
        const selected = await open({ directory: true, title: tr("download.select.folder") });
        if (!selected) {
          batchBusyRef.current = false;
          setBatchProgress(null);
          return;
        }
        saveDir = selected;
        setLastSaveDir(saveDir);
      }

      const originSource = resultSource ?? source;
      let failed = 0;
      for (const [index, item] of items.entries()) {
        let magnet = item.magnet;
        let fileBytes: number[] | undefined;
        if (!magnet) {
          if (item.torrent.startsWith("http")) {
            const [fetchedBytes] = await attempt(
              torrentApi.fetchTorrentBytes(item.torrent, originSource)
            );
            if (fetchedBytes && fetchedBytes.length > 0) fileBytes = fetchedBytes;
          } else {
            const [fetched] = await attempt(torrentApi.rutrackerGetMagnet(item.category));
            if (fetched) magnet = fetched;
          }
        }
        if (!magnet && !fileBytes) {
          failed += 1;
          setBatchProgress({ done: index + 1, total });
          continue;
        }
        const [id, error] = await attempt(
          torrentApi.startTorrentDownload({
            ...(magnet ? { magnet } : { fileBytes }),
            saveDir,
            onlyFiles: null,
            subFolder: null,
            sequential: false,
          })
        );
        if (error || id === undefined) failed += 1;
        else {
          const [, sourceError] = await attempt(
            torrentApi.setTorrentSource(id, { source: originSource, url: item.link }, undefined)
          );
          if (sourceError) reportBackgroundError("search.batch.source", sourceError);
        }
        setBatchProgress({ done: index + 1, total });
      }
      batchBusyRef.current = false;
      setBatchProgress(null);
      addNotification(
        tr("search.batch.done"),
        failed > 0 ? "error" : "success",
        failed > 0
          ? tr("search.batch.failed", { count: failed })
          : tr("search.batch.started", { count: total - failed })
      );
    },
    [resultSource, source]
  );

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
    return (
      suggestSpellingWithReason(submittedQuery, {
        animeIndex,
        history: searchHistory,
        symSpell: searchSymSpellEnabled,
      })?.correction ?? null
    );
  }, [submittedQuery, isLoading, data, searchHistory, animeIndex, searchSymSpellEnabled]);
  const applySubmitQuery = useCallback((query: string) => {
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
  }, []);

  const applyDidYouMean = () => {
    if (!didYouMean) return;
    setSearchParams(didYouMean);
    applySubmitQuery(didYouMean);
  };

  return {
    source,
    resultSource,
    sourceOptions,
    isLoading,
    isFetching,
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
    resultsPerPage: searchResultsPerPage,
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
    batchDownloadFor,
    batchBusy: batchProgress !== null,
    batchProgress,
    selectedTorrent,
    setSelectedTorrent,
  };
}
