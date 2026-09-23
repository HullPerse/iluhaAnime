import { useQuery } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import { tmdbApi } from "@/api/tmdb.api";
import { withFallback } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";

export function useCollectionMedia(
  tmdbId: number | null,
  anilistId: number | null,
  mediaType: "movie" | "tv",
  fetchMedia: boolean,
  fetchTrailer: boolean
) {
  const tmdbKeySet = useSettingsStore((s) => s.tmdbKeySet);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const anilistProxyUrl = useSettingsStore((s) => s.anilistProxyUrl);
  const media = useQuery({
    queryKey: ["tmdb_media", tmdbId, mediaType, tmdbKeySet ? 1 : 0, tmdbProxyUrl ?? "", "v2"],
    queryFn: () => withFallback(tmdbApi.getMedia(tmdbId as number, mediaType), null),
    enabled: fetchMedia && tmdbKeySet && tmdbId !== null,
    staleTime: Infinity,
  });
  const trailer = useQuery({
    queryKey: ["anilist_trailer", anilistId, anilistProxyUrl ?? "", "v2"],
    queryFn: () => withFallback(anilistApi.getAnimeById(anilistId as number), null),
    enabled: fetchTrailer && anilistId !== null,
    staleTime: Infinity,
  });
  return { media, trailer };
}
