import { anilistApi } from "@/api/anilist.api";
import { tmdbApi } from "@/api/tmdb.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
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
  const media = useAppQuery("static", {
    queryKey: queryKeys.tmdbMedia(tmdbId, mediaType, tmdbKeySet, tmdbProxyUrl ?? ""),
    queryFn: () => withFallback(tmdbApi.getMedia(tmdbId as number, mediaType), null),
    enabled: fetchMedia && tmdbKeySet && tmdbId !== null,
  });
  const trailer = useAppQuery("static", {
    queryKey: queryKeys.anilistTrailer(anilistId, anilistProxyUrl ?? ""),
    queryFn: () => withFallback(anilistApi.getAnimeById(anilistId as number), null),
    enabled: fetchTrailer && anilistId !== null,
  });
  return { media, trailer };
}
