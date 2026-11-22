import type { OpenedCard } from "@/types/api/cards";

export function packImageUrls(cards: readonly OpenedCard[]): string[] {
  const urls: string[] = [];

  for (const card of cards) {
    if (card.imageUrl) urls.push(card.imageUrl);

    if (card.collectionCoverUrl) urls.push(card.collectionCoverUrl);

    for (const cover of card.collage) {
      if (cover) urls.push(cover);
    }
  }

  return urls;
}
