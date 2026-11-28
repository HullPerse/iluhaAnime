import { useCell } from "@hullperse/hp_utils/react";
import { anilistMangaMode } from "@/store/anilistManga.store";
import { useCallback, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import type { AnilistFilterPageParams, AnilistSearchParams } from "@/api/anilist.api";
import { seasonLabels } from "@/config/system/labels.config";
import { useAppInfiniteQuery, useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { defaultAniListFilters } from "@/lib/anilist/anilistFilters.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { addSearchQuery } from "@/store/search.store";
import { getSettingsSnapshot, settingsAtoms } from "@/store/settings.store";
import type { AniListFilters, AniMedia, AniUser, SearchMode } from "@/types/anilist/anilist";
import type { AniListSearchRequest } from "@/types/anilist/anilistSearch";
import type { FilterPage } from "@/types/core/ipc";

interface PagedSearchRequest {
  params: AnilistFilterPageParams;
  maxPages: number;
}

function pageParamsFor(request: AniListSearchRequest, manga: boolean): PagedSearchRequest | null {
  const mediaType = manga ? "MANGA" : "ANIME";
  const configuredMaxPages = Math.max(1, settingsAtoms.anilistMaxPages.get());

  switch (request.kind) {
    case "global": {
      const params = { ...request.params, page: 1 };
      const maxPages = Math.max(1, request.params.maxPages ?? configuredMaxPages);
      delete params.maxPages;

      return { params: { ...params, mediaType }, maxPages };
    }

    case "season": {
      return {
        maxPages: configuredMaxPages,
        params: {
          adult: settingsAtoms.anilistAdultContent.get() ? null : false,
          mediaType: "ANIME",
          page: 1,
          perPage: settingsAtoms.anilistPageSize.get(),
          season: request.season,
          seasonYear: request.seasonYear,
        },
      };
    }

    case "tag": {
      return {
        maxPages: 3,
        params: { adult: null, mediaType, page: 1, perPage: 20, tags: [request.tag] },
      };
    }

    case "genre": {
      return {
        maxPages: 3,
        params: { adult: null, mediaType, page: 1, perPage: 20, genres: [request.genre] },
      };
    }

    case "studio": {
      return null;
    }
  }
}

function buildGlobalParams(query: string, filters: AniListFilters): AnilistSearchParams {
  const settings = getSettingsSnapshot();

  return searchFiltersToParams(
    filters,
    query.trim() || null,
    settings.anilistPageSize,
    settings.anilistMaxPages
  );
}

export function useProfileRecs(user: AniUser | null, showRecs: boolean) {
  const manga = useCell(anilistMangaMode);
  const userId = user?.id ?? null;
  const query = useAppQuery("slow", {
    queryKey: [...queryKeys.profileRecommendations(userId), manga],
    queryFn: () => anilistApi.getProfileRecommendations(userId ?? 0, manga ? "MANGA" : "ANIME"),
    enabled: showRecs && userId !== null,
  });

  return { recs: query.data ?? [], recsLoading: query.isLoading };
}

export function useAnilistSearch() {
  const manga = useCell(anilistMangaMode);
  const { t } = useI18n();
  const [searchTerms, setSearchTerms] = useState<string>("");
  const [global, setGlobal] = useState<boolean>(false);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(null);
  const [searchFilters, setSearchFilters] = useState<AniListFilters>(() =>
    defaultAniListFilters(settingsAtoms.anilistAdultContent.get())
  );
  const [request, setRequest] = useState<AniListSearchRequest | null>(null);
  const isStudioRequest = request?.kind === "studio";
  const pageRequest = request === null ? null : pageParamsFor(request, manga);

  const pages = useAppInfiniteQuery<FilterPage, Error>("live", {
    queryKey: [...queryKeys.anilistSearchPages(request), manga],
    queryFn: ({ pageParam }) => {
      if (!pageRequest) throw new Error("AniList search request is missing");

      return anilistApi.filterPage({ ...pageRequest.params, page: pageParam as number });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (!pageRequest || allPages.length >= pageRequest.maxPages) return undefined;

      const perPage = pageRequest.params.perPage ?? 20;

      if (lastPage.media.length < perPage) return undefined;
      const loaded = allPages.reduce((count, page) => count + page.media.length, 0);

      if (loaded >= lastPage.total) return undefined;

      return (lastPageParam as number) + 1;
    },
    enabled: pageRequest !== null,
  });

  const studioQuery = useAppQuery("live", {
    queryKey: [...queryKeys.anilistSearch(request), manga],
    queryFn: () => {
      if (request?.kind !== "studio") throw new Error("AniList studio request is missing");

      return anilistApi.searchByStudio(request.studioId);
    },
    enabled: isStudioRequest,
  });

  const searchResults: AniMedia[] = isStudioRequest
    ? (studioQuery.data ?? [])
    : (pages.data?.pages.flatMap((page) => page.media) ?? []);

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
      setSearchMode("genre");
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
    loadingSearch: studioQuery.isFetching || pages.isFetching,
    loadingSearchMore: pages.isFetchingNextPage,
    fetchNextSearchPage: () => {
      ignore(pages.fetchNextPage());
    },
    hasNextSearchPage: pages.hasNextPage ?? false,
    searchFilters,
    searchMode,
    searchResults,
    searchTag,
    searchTerms,
    setSearchFilters,
    setSearchTerms,
  };
}
