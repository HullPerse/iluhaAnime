import { useCallback, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { defaultFilters } from "@/config/anilist/filters.config";
import { seasonLabels } from "@/config/anilist/labels.config";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { attempt } from "@/lib/utils/attempt.utils";
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
    await attempt(
      (async () => {
        const params = searchFiltersToParams(
          searchFilters,
          query || null,
          useSettingsStore.getState().pageSize,
          useSettingsStore.getState().anilistMaxPages
        );
        const res = await anilistApi.search(params);
        setSearchResults(res);
      })()
    );
    setLoadingSearch(false);
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
      await attempt(
        (async () => {
          const res = await anilistApi.search({
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
          });
          setSearchResults(res);
        })()
      );
      setLoadingSearch(false);
    },
    [beginRemoteSearch, t]
  );
  const handleStudio = useCallback(
    async (id: number, name: string) => {
      beginRemoteSearch();
      setSearchTag(name);
      setSearchMode("studio");
      await attempt(
        (async () => {
          const res = await anilistApi.searchByStudio(id);
          setSearchResults(res);
        })()
      );
      setLoadingSearch(false);
    },
    [beginRemoteSearch]
  );
  const handleTag = useCallback(
    async (tag: string) => {
      beginRemoteSearch();
      setSearchTag(tag);
      setSearchMode("tag");
      await attempt(
        (async () => {
          const res = await anilistApi.searchByTag(tag);
          setSearchResults(res);
        })()
      );
      setLoadingSearch(false);
    },
    [beginRemoteSearch]
  );
  const handleGenre = useCallback(
    async (genre: string) => {
      beginRemoteSearch();
      setSearchTag(genre);
      setSearchMode("tag");
      await attempt(
        (async () => {
          const res = await anilistApi.searchByGenre(genre);
          setSearchResults(res);
        })()
      );
      setLoadingSearch(false);
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
