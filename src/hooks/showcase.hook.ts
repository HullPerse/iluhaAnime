import { tmdbApi } from "@/api/tmdb.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia, AnimeShowcase } from "@/types/anilist";

async function loadShowcase(anime: AniMedia): Promise<AnimeShowcase> {
  let trailerYoutubeId = anime.trailer_youtube_id ?? null;
  if (!trailerYoutubeId && tmdbApi.isConfigured()) {
    const results = await withFallback(
      tmdbApi.search<{ id: number; mediaType: string }>({
        query: anime.title,
        language: "ru-RU",
        includeAdult: false,
      }),
      []
    );
    const first = results.find((r) => r.mediaType === "movie" || r.mediaType === "tv");
    if (first) {
      const media = await withFallback(tmdbApi.getMedia(first.id, first.mediaType), null);
      trailerYoutubeId = media?.trailerYoutubeId ?? null;
    }
  }
  return { stills: [], trailerYoutubeId };
}

export function useAnimeShowcase(anime: AniMedia | undefined): AnimeShowcase | undefined {
  const tmdbKeySet = useSettingsStore((s) => s.tmdbKeySet);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const query = useAppQuery("static", {
    queryKey: queryKeys.animeShowcase(anime?.id ?? 0, tmdbKeySet ? 1 : 0, tmdbProxyUrl ?? ""),
    queryFn: () => (anime ? loadShowcase(anime) : Promise.resolve(undefined)),
    enabled: anime !== undefined,
  });
  return query.data;
}
