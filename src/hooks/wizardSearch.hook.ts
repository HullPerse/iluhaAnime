import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

export type WizardSearchResult = {
  id: number;
  title: string;
  cover_url: string | null;
  year?: number;
  duration?: number | null;
  episodes?: number | null;
  genres?: string[];
  studio?: string | null;
};

export function useWizardSearch(
  source: "anilist" | "tmdb" | "custom",
  search: string,
  tmdbApiKey: string | null
) {
  const [searchResults, setSearchResults] = useState<WizardSearchResult[]>([]);
  const [coverOptions, setCoverOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const searchAnilist = useCallback(async () => {
    const res = await invoke<
      {
        id: number;
        title: string;
        cover_url: string | null;
        season_year: number | null;
        duration: number | null;
        episodes: number | null;
        genres: string[];
        studios: { id: number; name: string }[];
      }[]
    >("search_anilist", { query: search, perPage: 8, maxPages: 1 });
    setSearchResults(
      res.map((r) => ({
        id: r.id,
        title: r.title,
        cover_url: r.cover_url,
        year: r.season_year ?? undefined,
        duration: r.duration,
        episodes: r.episodes,
        genres: r.genres,
        studio: r.studios[0]?.name ?? null,
      }))
    );
    const covers = res.map((r) => r.cover_url).filter(Boolean) as string[];
    if (covers.length) setCoverOptions(covers);
  }, [search]);

  const searchTmdb = useCallback(async () => {
    if (!tmdbApiKey) {
      setSearchResults([]);
      return;
    }
    const res = await invoke<
      {
        id: number;
        title: string;
        cover_url: string | null;
        year?: number | null;
        mediaType: string;
      }[]
    >("search_tmdb", {
      apiKey: tmdbApiKey,
      query: search,
      language: "ru-RU",
      includeAdult: false,
    });
    setSearchResults(
      res.map((r) => ({
        id: r.id,
        title: r.title,
        cover_url: r.cover_url,
        year: r.year ?? undefined,
      }))
    );
    const covers = res.map((r) => r.cover_url).filter(Boolean) as string[];
    if (covers.length) setCoverOptions(covers);
  }, [search, tmdbApiKey]);

  const runSearch = useCallback(async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      if (source === "anilist") await searchAnilist();
      else if (source === "tmdb") await searchTmdb();
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [search, source, searchAnilist, searchTmdb]);

  return { searchResults, coverOptions, setCoverOptions, loading, runSearch };
}