import { useQuery } from "@tanstack/react-query";

import { tmdbApi } from "@/api/tmdb.api";
import { withFallback } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia, AnimeShowcase } from "@/types/anilist";

const SHOWCASE_CACHE_TAG = "v3";

async function loadShowcase(anime: AniMedia): Promise<AnimeShowcase> {
  let trailerYoutubeId = anime.trailer_youtube_id ?? null;
  if (!trailerYoutubeId && tmdbApi.isConfigured()) {
    const results = await withFallback(
      tmdbApi.search<{ id: number; media_type: string }>({
        query: anime.title,
        language: "ru-RU",
        includeAdult: false,
      }),
      []
    );
    const first = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
    if (first) {
      const media = await withFallback(tmdbApi.getMedia(first.id, first.media_type), null);
      trailerYoutubeId = media?.trailerYoutubeId ?? null;
    }
  }
  return { stills: [], trailerYoutubeId };
}

export function useAnimeShowcase(anime: AniMedia | undefined): AnimeShowcase | undefined {
  const tmdbKeySet = useSettingsStore((s) => s.tmdbKeySet);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const query = useQuery({
    queryKey: [
      "anilist_showcase",
      anime?.id,
      tmdbKeySet ? 1 : 0,
      tmdbProxyUrl ?? "",
      SHOWCASE_CACHE_TAG,
    ],
    queryFn: () => (anime ? loadShowcase(anime) : Promise.resolve(undefined)),
    enabled: anime !== undefined,
    staleTime: Infinity,
  });
  return query.data;
}
