import { CARD_GRID_SUGGESTION_LIMIT } from "@/config/cards/grid.config";
import type { CollectionItem } from "@/types/api/cards";
import type { CardTileItem } from "@/types/ui/collection";

export function cardTileKey(card: CardTileItem): string {
  return `${card.kind}:${card.entityId}:${card.rarity}:${card.variant}`;
}

export function cardImageUrls(cards: readonly CollectionItem[]): string[] {
  const urls: string[] = [];

  for (const card of cards) {
    if (card.imageUrl) urls.push(card.imageUrl);

    for (const cover of card.collage) {
      if (cover) urls.push(cover);
    }
  }

  return urls;
}

export function suggestionTitles(cards: readonly CollectionItem[]): string[] {
  const titles: string[] = [];

  for (const card of cards) {
    const title = card.title.trim();

    if (title === "" || titles.includes(title)) continue;
    titles.push(title);

    if (titles.length >= CARD_GRID_SUGGESTION_LIMIT) break;
  }

  return titles;
}
