import { useCallback, useState } from "react";

import { SEARCH_RANKING } from "@/config/search/ranking.config";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { fuzzyMatchScore, normalizeSearchText } from "@/lib/search/suggestions.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { WizardSearchResult } from "@/types/collection";

function rankWizardResults(
  results: WizardSearchResult[],
  query: string,
  existingTitles: Set<string>,
  favouriteIds: Set<number>
): WizardSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  return [...results]
    .map((r) => {
      const base = fuzzyMatchScore(normalizedQuery, normalizeSearchText(r.title)) ?? 0;
      const isDuplicate = existingTitles.has(normalizeSearchText(r.title));
      const isFavourite = favouriteIds.has(r.id);
      const score =
        base -
        (isDuplicate ? SEARCH_RANKING.WIZARD_DUPLICATE_PENALTY : 0) +
        (isFavourite ? SEARCH_RANKING.WIZARD_FAVOURITE_BOOST : 0);
      return { r, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

export function useWizardSearch(
  source: "anilist" | "tmdb" | "custom",
  search: string,
  tmdbApiKey: string | null,
  tmdbProxyUrl?: string | null,
  existingTitles?: Set<string>,
  favouriteIds?: Set<number>
) {
  const [searchResults, setSearchResults] = useState<WizardSearchResult[]>([]);
  const [coverOptions, setCoverOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchAnilist = useCallback(async () => {
    const res = await invokeTyped<
      {
        id: number;
        title: string;
        titles: string[];
        cover_url: string | null;
        season_year: number | null;
        duration: number | null;
        episodes: number | null;
        genres: string[];
        tags: string[];
        studios: { id: number; name: string }[];
        description: string | null;
      }[]
    >("search_anilist", {
      query: search,
      per_page: 8,
      max_pages: 1,
      ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
    });
    const mapped = res.map((r) => ({
      id: r.id,
      title: r.title,
      cover_url: r.cover_url,
      year: r.season_year ?? undefined,
      duration: r.duration,
      episodes: r.episodes,
      genres: r.genres,
      tags: r.tags ?? [],
      studio: r.studios[0]?.name ?? null,
      altTitles: r.titles ?? [],
      description: r.description ?? undefined,
    }));
    const ranked =
      existingTitles || favouriteIds
        ? rankWizardResults(mapped, search, existingTitles ?? new Set(), favouriteIds ?? new Set())
        : mapped;
    setSearchResults(ranked);
    const covers = res.map((r) => r.cover_url).filter(Boolean) as string[];
    if (covers.length) setCoverOptions((prev) => [...new Set([...covers, ...prev])].slice(0, 8));
    setSearchError(null);
  }, [search, existingTitles, favouriteIds]);

  const searchTmdb = useCallback(async () => {
    if (!tmdbApiKey) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    const res = await invokeTyped<
      {
        id: number;
        title: string;
        cover_url: string | null;
        year?: number | null;
        mediaType: string;
        overview: string | null;
        altTitles?: string[];
      }[]
    >("search_tmdb", {
      apiKey: tmdbApiKey,
      query: search,
      language: "ru-RU",
      includeAdult: false,
      proxyUrl: tmdbProxyUrl || undefined,
    } as unknown as Record<string, unknown>);
    const mapped = res.map((r) => ({
      id: r.id,
      title: r.title,
      cover_url: r.cover_url,
      year: r.year ?? undefined,
      mediaType: r.mediaType,
      description: r.overview ?? undefined,
      altTitles: r.altTitles ?? [],
    }));
    const ranked =
      existingTitles || favouriteIds
        ? rankWizardResults(mapped, search, existingTitles ?? new Set(), favouriteIds ?? new Set())
        : mapped;
    setSearchResults(ranked);
    const covers = res.map((r) => r.cover_url).filter(Boolean) as string[];
    if (covers.length) setCoverOptions((prev) => [...new Set([...covers, ...prev])].slice(0, 8));
    setSearchError(null);
  }, [search, tmdbApiKey, tmdbProxyUrl, existingTitles, favouriteIds]);

  const runSearch = useCallback(async () => {
    if (!search.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setLoading(true);
    setSearchError(null);
    try {
      if (source === "anilist") await searchAnilist();
      else if (source === "tmdb") await searchTmdb();
      else setSearchResults([]);
    } catch (error) {
      setSearchResults([]);
      const message = error instanceof Error ? error.message : String(error ?? "");
      setSearchError(message || "Search failed");
    } finally {
      setLoading(false);
    }
  }, [search, source, searchAnilist, searchTmdb]);

  return { searchResults, coverOptions, setCoverOptions, loading, searchError, runSearch };
}
