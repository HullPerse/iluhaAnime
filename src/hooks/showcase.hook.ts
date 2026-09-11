import { useQuery } from "@tanstack/react-query";

import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia, AnimeShowcase } from "@/types/anilist";

const SHOWCASE_CACHE_TAG = "v3";

async function loadShowcase(
  anime: AniMedia,
  tmdbKeySet: boolean,
  tmdbProxyUrl: string | null
): Promise<AnimeShowcase> {
  let trailerYoutubeId = anime.trailer_youtube_id ?? null;
  if (!trailerYoutubeId && tmdbKeySet) {
    const results = await withFallback(
      invokeTyped<{ id: number; media_type: string }[]>("search_tmdb", {
        query: anime.title,
        language: "ru-RU",
        includeAdult: false,
        proxyUrl: tmdbProxyUrl || undefined,
      }),
      []
    );
    const first = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
    if (first) {
      const media = await withFallback(
        invokeTyped<{ backdrops: { url: string }[]; trailerYoutubeId: string | null }>(
          "get_tmdb_media",
          {
            tmdbId: first.id,
            mediaType: first.media_type,
            proxyUrl: tmdbProxyUrl || undefined,
          }
        ),
        null
      );
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
    queryFn: () =>
      anime ? loadShowcase(anime, tmdbKeySet, tmdbProxyUrl) : Promise.resolve(undefined),
    enabled: anime !== undefined,
    staleTime: Infinity,
  });
  return query.data;
}
