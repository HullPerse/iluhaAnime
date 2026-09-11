import { useCallback, useState } from "react";

import { seasonLabels } from "@/config/anilist/labels.config";
import { applyIntentToFilters, searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { defaultFilters } from "@/routes/components/anilist/filters.anilist";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListFilters, AniMedia, SearchMode } from "@/types/anilist";

export function useAnilistSearch() {
  const { t } = useI18n();
  const addQuery = useSearchStore((state) => state.addQuery);
  const [searchTerms, setSearchTerms] = useState<string>("");
  const [global, setGlobal] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<AniMedia[]>([]);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchFilters, setSearchFilters] = useState<AniListFilters>(defaultFilters);
  const handleGlobal = async () => {
    const query = searchTerms.trim();
    if (query) addQuery(query, "anilist");
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    try {
      const { filters: mergedFilters, query: intentQuery } = applyIntentToFilters(
        searchFilters,
        searchTerms
      );
      const params = searchFiltersToParams(
        mergedFilters,
        intentQuery,
        useSettingsStore.getState().pageSize,
        useSettingsStore.getState().anilistMaxPages
      );
      const res = await invokeTyped<AniMedia[]>("search_anilist", {
        ...params,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      });
      setSearchResults(res);
    } finally {
      setLoadingSearch(false);
    }
  };
  const beginRemoteSearch = useCallback(() => {
    setGlobal(true);
    setLoadingSearch(true);
    setSearchResults([]);
    setSearchTerms("");
  }, []);
  const handleSeason = useCallback(
    async (season: string, seasonYear: number | null) => {
      beginRemoteSearch();
      setSearchTag(
        `${t(toLocaleKey(seasonLabels[season] ?? season))}${seasonYear ? ` ${seasonYear}` : ""}`
      );
      setSearchMode("season");
      try {
        const res = await invokeTyped<AniMedia[]>("search_anilist", {
          query: null,
          tags: null,
          genres: null,
          format: null,
          status: null,
          season: season || null,
          seasonYear,
          adult: null,
          sort: null,
          source: null,
          country: null,
          yearFrom: null,
          yearTo: null,
          episodesFrom: null,
          episodesTo: null,
          scoreFrom: null,
          scoreTo: null,
          maxPages: useSettingsStore.getState().anilistMaxPages,
          perPage: useSettingsStore.getState().pageSize,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        });
        setSearchResults(res);
      } finally {
        setLoadingSearch(false);
      }
    },
    [beginRemoteSearch, t]
  );
  const handleStudio = useCallback(
    async (id: number, name: string) => {
      beginRemoteSearch();
      setSearchTag(name);
      setSearchMode("studio");
      try {
        const res = await invokeTyped<AniMedia[]>("search_anilist_by_studio", {
          studioId: id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        });
        setSearchResults(res);
      } finally {
        setLoadingSearch(false);
      }
    },
    [beginRemoteSearch]
  );
  const handleTag = useCallback(
    async (tag: string) => {
      beginRemoteSearch();
      setSearchTag(tag);
      setSearchMode("tag");
      try {
        const res = await invokeTyped<AniMedia[]>("search_anilist_by_tag", {
          tag,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        });
        setSearchResults(res);
      } finally {
        setLoadingSearch(false);
      }
    },
    [beginRemoteSearch]
  );
  const handleGenre = useCallback(
    async (genre: string) => {
      beginRemoteSearch();
      setSearchTag(genre);
      setSearchMode("tag");
      try {
        const res = await invokeTyped<AniMedia[]>("search_anilist_by_genre", {
          genre,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        });
        setSearchResults(res);
      } finally {
        setLoadingSearch(false);
      }
    },
    [beginRemoteSearch]
  );
  const handleReset = useCallback(() => {
    setSearchTerms("");
    setGlobal(false);
    setSearchResults([]);
    setSearchTag(null);
    setSearchMode(null);
    setSearchFilters(defaultFilters);
  }, []);
  return {
    global,
    handleGenre,
    handleGlobal,
    handleReset,
    handleSeason,
    handleStudio,
    handleTag,
    loadingSearch,
    searchFilters,
    searchMode,
    searchResults,
    searchTag,
    searchTerms,
    setSearchFilters,
    setSearchTerms,
  };
}
