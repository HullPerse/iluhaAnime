import { useQuery } from "@tanstack/react-query";

import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";

export interface ViewerMedia {
  backdrops: { url: string }[];
  trailerYoutubeId: string | null;
}

export function useCollectionMedia(
  tmdbId: number | null,
  anilistId: number | null,
  mediaType: "movie" | "tv",
  fetchMedia: boolean,
  fetchTrailer: boolean
) {
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const media = useQuery({
    queryKey: ["tmdb_media", tmdbId, mediaType],
    queryFn: () =>
      withFallback(
        invokeTyped<ViewerMedia>("get_tmdb_media", {
          apiKey: tmdbApiKey,
          tmdbId,
          mediaType,
          proxyUrl: tmdbProxyUrl || undefined,
        } as unknown as Record<string, unknown>),
        null
      ),
    enabled: fetchMedia && tmdbApiKey !== null && tmdbId !== null,
    staleTime: Infinity,
  });
  const trailer = useQuery({
    queryKey: ["anilist_trailer", anilistId],
    queryFn: () =>
      withFallback(
        invokeTyped<{ trailer_youtube_id: string | null }>("get_anime_by_id", {
          id: anilistId,
        }),
        null
      ),
    enabled: fetchTrailer && anilistId !== null,
    staleTime: Infinity,
  });
  return { media, trailer };
}
