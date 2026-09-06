import type { CollectionItem } from "@/types/collection";

export interface StoredMedia {
  stills: string[];
  trailerYoutubeId: string | null;
}

export function readStoredMedia(detailsJson: CollectionItem["detailsJson"]): StoredMedia {
  return {
    stills: detailsJson?.stills ?? [],
    trailerYoutubeId: detailsJson?.trailerYoutubeId ?? null,
  };
}

export function withStoredMedia(
  detailsJson: CollectionItem["detailsJson"],
  stills: string[],
  trailerYoutubeId: string | null
): NonNullable<CollectionItem["detailsJson"]> {
  return {
    ...detailsJson,
    stills,
    trailerYoutubeId,
  };
}
