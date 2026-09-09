import { useQuery } from "@tanstack/react-query";

import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

export interface AnimeShowcase {
  /** Kept for API compatibility with consumers that expect the field. */
  stills: string[];
  trailerYoutubeId: string | null;
}

// Bump to invalidate caches poisoned during outage eras (keys live forever).
const SHOWCASE_CACHE_TAG = "v3";

/**
 * Resolves the trailer id for an anime. Stills no longer come from here:
 * in the AniList detail view they were removed by decision (2026-09-09) —
 * the collection owns stills, AniList keeps only the trailer.
 */
async function loadShowcase(
  anime: AniMedia,
  tmdbKey: string | null,
  tmdbProxyUrl: string | null
): Promise<AnimeShowcase> {
  let trailerYoutubeId = anime.trailer_youtube_id ?? null;
  if (!trailerYoutubeId && tmdbKey) {
    const results = await withFallback(
      invokeTyped<{ id: number; media_type: string }[]>("search_tmdb", {
        apiKey: tmdbKey,
        query: anime.title,
        language: "ru-RU",
        includeAdult: false,
        proxyUrl: tmdbProxyUrl || undefined,
      } as unknown as Record<string, unknown>),
      []
    );
    const first = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
    if (first) {
      const media = await withFallback(
        invokeTyped<{ backdrops: { url: string }[]; trailerYoutubeId: string | null }>(
          "get_tmdb_media",
          {
            apiKey: tmdbKey,
            tmdbId: first.id,
            mediaType: first.media_type,
            proxyUrl: tmdbProxyUrl || undefined,
          } as unknown as Record<string, unknown>
        ),
        null
      );
      trailerYoutubeId = media?.trailerYoutubeId ?? null;
    }
  }
  return { stills: [], trailerYoutubeId };
}

/** Shared showcase query: one cache entry feeds the trailer header buttons. */
export function useAnimeShowcase(anime: AniMedia | undefined): AnimeShowcase | undefined {
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const query = useQuery({
    queryKey: ["anilist_showcase", anime?.id, tmdbApiKey ? 1 : 0, tmdbProxyUrl ?? "", SHOWCASE_CACHE_TAG],
    queryFn: () =>
      anime ? loadShowcase(anime, tmdbApiKey, tmdbProxyUrl) : Promise.resolve(undefined),
    enabled: anime !== undefined,
    staleTime: Infinity,
  });
  return query.data;
}
