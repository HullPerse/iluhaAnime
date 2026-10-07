import { useCallback, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import type { AnilistFilterPageParams, AnilistSearchParams } from "@/api/anilist.api";
import { seasonLabels } from "@/config/anilist/labels.config";
import { useAppInfiniteQuery, useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { defaultAniListFilters } from "@/lib/anilist/filters.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { addSearchQuery } from "@/store/search.store";
import { getSettingsSnapshot, settingsAtoms } from "@/store/settings.store";
import type { AniListFilters, AniMedia, SearchMode } from "@/types/anilist";
import type { FilterPage } from "@/types/ipc";

export type AniListSearchRequest =
  | { kind: "global"; params: AnilistSearchParams }
  | { kind: "season"; season: string; seasonYear: number | null }
  | { kind: "studio"; studioId: number }
  | { kind: "tag"; tag: string }
  | { kind: "genre"; genre: string };

async function runSearchRequest(request: AniListSearchRequest): Promise<AniMedia[]> {
  switch (request.kind) {
    case "global": {
      return anilistApi.search(request.params);
    }
    case "season": {
      return anilistApi.search({
        adult: settingsAtoms.anilistAdultContent.get() ? null : false,
        country: null,
        episodesFrom: null,
        episodesTo: null,
        format: null,
        genres: null,
        maxPages: settingsAtoms.anilistMaxPages.get(),
        perPage: settingsAtoms.pageSize.get(),
        query: null,
        scoreFrom: null,
        scoreTo: null,
        season: request.season || null,
        seasonYear: request.seasonYear,
        sort: null,
        source: null,
        status: null,
        tags: null,
        yearFrom: null,
        yearTo: null,
      });
    }
    case "studio": {
      return anilistApi.searchByStudio(request.studioId);
    }
    case "tag": {
      return anilistApi.searchByTag(request.tag);
    }
    case "genre": {
      return anilistApi.searchByGenre(request.genre);
    }
  }
}

function buildGlobalParams(query: string, filters: AniListFilters): AnilistSearchParams {
  const settings = getSettingsSnapshot();
  return searchFiltersToParams(
    filters,
    query.trim() || null,
    settings.pageSize,
    settings.anilistMaxPages
  ) as AnilistSearchParams;
}

export function useAnilistSearch() {
  const { t } = useI18n();
  const [searchTerms, setSearchTerms] = useState<string>("");
  const [global, setGlobal] = useState<boolean>(false);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(null);
  const [searchFilters, setSearchFilters] = useState<AniListFilters>(() =>
    defaultAniListFilters(settingsAtoms.anilistAdultContent.get())
  );
  const [request, setRequest] = useState<AniListSearchRequest | null>(null);
  const isGlobalRequest = request?.kind === "global";

  const query = useAppQuery("live", {
    queryKey: queryKeys.anilistSearch(request),
    queryFn: () => runSearchRequest(request as AniListSearchRequest),
    enabled: request !== null && !isGlobalRequest,
  });

  const globalPages = useAppInfiniteQuery<FilterPage, Error>("live", {
    queryKey: queryKeys.anilistSearch(request),
    queryFn: ({ pageParam }) =>
      anilistApi.filterPage({
        ...((request as Extract<AniListSearchRequest, { kind: "global" }>)
          .params as AnilistFilterPageParams),
        page: pageParam as number,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      const params = (request as Extract<AniListSearchRequest, { kind: "global" }>).params;
      const perPage =
        typeof params.perPage === "number" && params.perPage > 0
          ? params.perPage
          : settingsAtoms.pageSize.get();
      if (lastPage.media.length < perPage) return undefined;
      const loaded = allPages.reduce((count, page) => count + page.media.length, 0);
      if (loaded >= lastPage.total) return undefined;
      return (lastPageParam as number) + 1;
    },
    enabled: isGlobalRequest,
  });

  const searchResults: AniMedia[] = isGlobalRequest
    ? (globalPages.data?.pages.flatMap((page) => page.media) ?? [])
    : (query.data ?? []);

  const handleGlobal = useCallback(() => {
    const terms = searchTerms.trim();
    if (terms) addSearchQuery(terms, "anilist");
    setGlobal(true);
    setSearchTag(null);
    setSearchMode(null);
    setRequest({ kind: "global", params: buildGlobalParams(searchTerms, searchFilters) });
  }, [searchTerms, searchFilters]);

  const beginRemoteSearch = useCallback(() => {
    setGlobal(true);
    setSearchTerms("");
  }, []);

  const handleSeason = useCallback(
    (season: string, seasonYear: number | null) => {
      beginRemoteSearch();
      setSearchTag(
        `${t(toLocaleKey(seasonLabels[season] ?? season))}${seasonYear ? ` ${seasonYear}` : ""}`
      );
      setSearchMode("season");
      setRequest({ kind: "season", season, seasonYear });
    },
    [beginRemoteSearch, t]
  );

  const handleStudio = useCallback(
    (id: number, name: string) => {
      beginRemoteSearch();
      setSearchTag(name);
      setSearchMode("studio");
      setRequest({ kind: "studio", studioId: id });
    },
    [beginRemoteSearch]
  );

  const handleTag = useCallback(
    (tag: string) => {
      beginRemoteSearch();
      setSearchTag(tag);
      setSearchMode("tag");
      setRequest({ kind: "tag", tag });
    },
    [beginRemoteSearch]
  );

  const handleGenre = useCallback(
    (genre: string) => {
      beginRemoteSearch();
      setSearchTag(genre);
      setSearchMode("tag");
      setRequest({ kind: "genre", genre });
    },
    [beginRemoteSearch]
  );

  const clearSearchState = useCallback(() => {
    setSearchTerms("");
    setGlobal(false);
    setRequest(null);
    setSearchTag(null);
    setSearchMode(null);
  }, []);

  const handleClearSearch = useCallback(() => {
    clearSearchState();
  }, [clearSearchState]);

  const handleReset = useCallback(() => {
    clearSearchState();
    setSearchFilters(defaultAniListFilters(settingsAtoms.anilistAdultContent.get()));
  }, [clearSearchState]);

  const applyFilters = useCallback(
    (filters: AniListFilters) => {
      setSearchFilters(filters);
      if (global && request?.kind === "global") {
        setRequest({
          kind: "global",
          params: buildGlobalParams(searchTerms, filters),
        });
      }
    },
    [global, request, searchTerms]
  );

  return {
    applyFilters,
    global,
    handleClearSearch,
    handleGenre,
    handleGlobal,
    handleReset,
    handleSeason,
    handleStudio,
    handleTag,
    loadingSearch: query.isFetching || globalPages.isFetching,
    loadingSearchMore: globalPages.isFetchingNextPage,
    fetchNextSearchPage: () => {
      ignore(globalPages.fetchNextPage());
    },
    hasNextSearchPage: globalPages.hasNextPage ?? false,
    searchFilters,
    searchMode,
    searchResults,
    searchTag,
    searchTerms,
    setSearchFilters,
    setSearchTerms,
  };
}
