import type { CollectionItem, CollectionRowProps } from "@/types/collection";

export function rowMetaParts(item: CollectionItem): string[] {
  const parts: string[] = [];
  if (item.year != null) parts.push(String(item.year));
  if (item.studio) parts.push(item.studio);
  const genres = item.genres.slice(0, 3).join(", ");
  if (genres) parts.push(genres);
  return parts;
}

export function sameRowVisual(prev: CollectionRowProps, next: CollectionRowProps): boolean {
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
    a.status === b.status &&
    a.rating === b.rating &&
    a.progressValue === b.progressValue &&
    a.progressTotal === b.progressTotal &&
    a.progressUnit === b.progressUnit &&
    a.year === b.year &&
    a.studio === b.studio &&
    a.type === b.type &&
    a.genres.length === b.genres.length &&
    a.genres.every((genre, index) => genre === b.genres[index])
  );
}
