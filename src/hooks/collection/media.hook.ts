import { useQuery } from "@tanstack/react-query";

import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { ViewerMedia } from "@/types/collection";


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
    queryFn: () =>
      withFallback(
        invokeTyped<ViewerMedia>("get_tmdb_media", {
          apiKey: "",
          tmdbId,
          mediaType,
          proxyUrl: tmdbProxyUrl || undefined,
        }),
        null
      ),
    enabled: fetchMedia && tmdbKeySet && tmdbId !== null,
    staleTime: Infinity,
  });
  const trailer = useQuery({
    queryKey: ["anilist_trailer", anilistId, anilistProxyUrl ?? "", "v2"],
    queryFn: () =>
      withFallback(
        invokeTyped<{ trailer_youtube_id: string | null }>("get_anime_by_id", {
          id: anilistId,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
        null
      ),
    enabled: fetchTrailer && anilistId !== null,
    staleTime: Infinity,
  });
  return { media, trailer };
}
