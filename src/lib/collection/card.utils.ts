import { GENRE_PREVIEW_COUNT } from "@/config/collection/card.config";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import type { CollectionCardProps } from "@/types/collection";

export function resolveCardCover(
  item: Pick<CollectionCardProps["item"], "coverUrl" | "title">,
  cachedUrl: string | null,
  remoteSrc: string | null,
  allowDirect: boolean
): string {
  if (cachedUrl) return cachedUrl;
  if (remoteSrc) return remoteSrc;
  if (allowDirect && item.coverUrl) return item.coverUrl;
  if (item.title) return generatePlaceholder(item.title);
  return "";
}

export function uncachedCoverSource(
  item: Pick<CollectionCardProps["item"], "coverUrl" | "coverBlobId" | "thumbBlobId">
): string | null {
  if (item.thumbBlobId ?? item.coverBlobId) return null;
  return item.coverUrl ?? null;
}

export function sameCardVisual(prev: CollectionCardProps, next: CollectionCardProps): boolean {
  const a = prev.item;
  const b = next.item;
  return (
    prev.statuses === next.statuses &&
    prev.selected === next.selected &&
    prev.onOpen === next.onOpen &&
    a.id === b.id &&
    a.title === b.title &&
    a.coverUrl === b.coverUrl &&
    a.coverBlobId === b.coverBlobId &&
    a.thumbBlobId === b.thumbBlobId &&
    a.year === b.year &&
    a.type === b.type &&
    a.status === b.status &&
    a.rating === b.rating &&
    a.isFavorite === b.isFavorite &&
    a.progressValue === b.progressValue &&
    a.progressTotal === b.progressTotal &&
    a.progressUnit === b.progressUnit &&
    a.genres.slice(0, GENRE_PREVIEW_COUNT).join(",") ===
      b.genres.slice(0, GENRE_PREVIEW_COUNT).join(",")
  );
}
