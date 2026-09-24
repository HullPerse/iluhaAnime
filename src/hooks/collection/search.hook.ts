import { useCallback, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { tmdbApi } from "@/api/tmdb.api";
import { WIZARD_RESULTS_MAX } from "@/config/collection/defaults.config";
import { SEARCH_RANKING } from "@/config/search/ranking.config";
import { prefetchRemoteImages } from "@/hooks/remoteImage.hook";
import { fuzzyMatchScore, normalizeSearchText } from "@/lib/search/suggestions.utils";
import { attempt, withFallback } from "@/lib/utils/attempt.utils";
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

async function lookupTmdbCover(id: number, mediaType?: string): Promise<string | null> {
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  const details = await withFallback(
    tmdbApi.getDetails<{ posters: { url: string }[] }>(id, mediaType),
    null
  );
  return details?.posters?.find((poster) => poster.url)?.url ?? null;
}

async function lookupAnilistCover(id: number): Promise<string | null> {
  const media = await withFallback(anilistApi.getAnimeById<{ cover_url: string | null }>(id), null);
  return media?.cover_url ?? null;
}

export function useWizardSearch(
  source: "anilist" | "tmdb" | "custom",
  search: string,
  existingTitles?: Set<string>,
  favouriteIds?: Set<number>
) {
  const [searchResults, setSearchResults] = useState<WizardSearchResult[]>([]);
  const [coverOptions, setCoverOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const coverLookupRef = useRef(0);

  const fillMissingCovers = useCallback((rows: WizardSearchResult[], from: "anilist" | "tmdb") => {
    const missing = rows.filter((row) => !row.cover_url);
    if (!missing.length) return;
    coverLookupRef.current += 1;
    const lookupId = coverLookupRef.current;
    const applyCover = async (row: WizardSearchResult) => {
      const cover =
        from === "tmdb"
          ? await lookupTmdbCover(row.id, row.mediaType)
          : await lookupAnilistCover(row.id);
      if (!cover || lookupId !== coverLookupRef.current) return;
      prefetchRemoteImages([cover]);
      setSearchResults((prev) =>
        prev.map((r) => (r.id === row.id && !r.cover_url ? { ...r, cover_url: cover } : r))
      );
    };
    for (const row of missing) {
      attempt(applyCover(row));
    }
  }, []);

  const searchAnilist = useCallback(async () => {
    const res = await anilistApi.search<{
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
    }>({
      query: search,
      perPage: WIZARD_RESULTS_MAX,
      maxPages: 1,
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
    const page = ranked.slice(0, WIZARD_RESULTS_MAX);
    setSearchResults(page);
    prefetchRemoteImages(page.map((r) => r.cover_url));
    fillMissingCovers(page, "anilist");
    const covers = res.map((r) => r.cover_url).filter(Boolean) as string[];
    if (covers.length) setCoverOptions((prev) => [...new Set([...covers, ...prev])].slice(0, 8));
    setSearchError(null);
  }, [search, existingTitles, favouriteIds, fillMissingCovers]);

  const searchTmdb = useCallback(async () => {
    if (!tmdbApi.isConfigured()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    const res = await tmdbApi.search<{
      id: number;
      title: string;
      coverUrl: string | null;
      year?: number | null;
      mediaType: string;
      overview: string | null;
      altTitles?: string[];
    }>({
      query: search,
      language: "ru-RU",
      includeAdult: false,
      perPage: WIZARD_RESULTS_MAX,
      maxPages: 1,
    });
    const mapped = res.map((r) => ({
      id: r.id,
      title: r.title,
      cover_url: r.coverUrl ?? null,
      year: r.year ?? undefined,
      mediaType: r.mediaType,
      description: r.overview ?? undefined,
      altTitles: r.altTitles ?? [],
    }));
    const ranked =
      existingTitles || favouriteIds
        ? rankWizardResults(mapped, search, existingTitles ?? new Set(), favouriteIds ?? new Set())
        : mapped;
    const page = ranked.slice(0, WIZARD_RESULTS_MAX);
    setSearchResults(page);
    prefetchRemoteImages(page.map((r) => r.cover_url));
    fillMissingCovers(page, "tmdb");
    const covers = res.map((r) => r.coverUrl).filter(Boolean) as string[];
    if (covers.length) setCoverOptions((prev) => [...new Set([...covers, ...prev])].slice(0, 8));
    setSearchError(null);
  }, [search, existingTitles, favouriteIds, fillMissingCovers]);

  const runSearch = useCallback(async () => {
    if (!search.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearchError(null);
    const [, error] = await attempt(
      (async () => {
        if (source === "anilist") await searchAnilist();
        else if (source === "tmdb") await searchTmdb();
        else setSearchResults([]);
      })()
    );
    if (error) {
      setSearchResults([]);
      const message = error.message || "Search failed";
      setSearchError(message);
    }
    setSearched(true);
    setLoading(false);
  }, [search, source, searchAnilist, searchTmdb]);

  return {
    searchResults,
    coverOptions,
    setCoverOptions,
    loading,
    searchError,
    searched,
    runSearch,
  };
}
