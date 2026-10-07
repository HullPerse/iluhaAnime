import { anilistApi } from "@/api/anilist.api";
import { tmdbApi } from "@/api/tmdb.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { withFallback } from "@/lib/utils/attempt.utils";
import { settingsAtoms } from "@/store/settings.store";

export function useCollectionMedia(
  tmdbId: number | null,
  anilistId: number | null,
  mediaType: "movie" | "tv",
  fetchMedia: boolean,
  fetchTrailer: boolean
) {
  const tmdbKeySet = useCell(settingsAtoms.tmdbKeySet);
  const tmdbProxyUrl = useCell(settingsAtoms.tmdbProxyUrl);
  const anilistProxyUrl = useCell(settingsAtoms.anilistProxyUrl);
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
