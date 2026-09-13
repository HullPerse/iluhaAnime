import { useCollectionMedia } from "@/hooks/collection/media.hook";
import type { MediaViewerParts } from "@/types/collection";

export function useViewerMedia(
  tmdbId: number | null,
  anilistId: number | null,
  mediaType: "movie" | "tv",
  stored: MediaViewerParts["stored"]
) {
  const { media, trailer: anilistTrailer } = useCollectionMedia(
    tmdbId,
    anilistId,
    mediaType,
    stored.stills.length === 0,
    stored.trailerYoutubeId === null
  );
  const data = media.data;
  const pending = media.isLoading || anilistTrailer.isLoading;
  const trailer =
    stored.trailerYoutubeId ??
    data?.trailerYoutubeId ??
    anilistTrailer.data?.trailer_youtube_id ??
    null;
  const stills =
    stored.stills.length > 0 ? stored.stills : (data?.backdrops ?? []).map((b) => b.url);
  return { stills, trailer, pending };
}
