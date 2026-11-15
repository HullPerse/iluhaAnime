import type { CollectionItem } from "@/types/api/cards";

/** Public AniList page for card kinds that have a dedicated site profile. */
export function anilistCardUrl(
  card: Pick<CollectionItem, "kind" | "entityId">
): string | null {
  if (card.kind === "staff") return `https://anilist.co/staff/${card.entityId}`;
  if (card.kind === "studio") return `https://anilist.co/studio/${card.entityId}`;
  return null;
}
