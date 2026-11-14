import type { GiftCard } from "@/types/api/cards";
import type { CardGiftDeepLink, CardGiftPreview } from "@/types/core/deeplink";
import type { CardFaceItem } from "@/types/ui/collection";

function giftPreviewCard(gift: CardGiftDeepLink): CardFaceItem | null {
  const preview = gift.preview;
  const stack = gift.cards[0];
  if (preview === undefined || stack === undefined) return null;
  return {
    kind: gift.kind,
    entityId: gift.entityId,
    title: preview.title,
    imageUrl: preview.imageUrl,
    collage: preview.collage,
    rarity: stack.rarity,
    variant: stack.variant,
    value: stack.value,
  };
}

function claimedDisplayCard(card: GiftCard, preview: CardGiftPreview | undefined): CardFaceItem {
  const fallbackTitle = `${card.kind} #${card.entityId}`;
  const titleMissing = card.title.trim() === "" || card.title === fallbackTitle;
  return {
    ...card,
    title: titleMissing ? (preview?.title ?? card.title) : card.title,
    imageUrl: card.imageUrl ?? preview?.imageUrl ?? null,
    collage: card.collage.length > 0 ? card.collage : (preview?.collage ?? []),
  };
}

export function displayCard(
  gift: CardGiftDeepLink,
  claimedCard: GiftCard | null
): CardFaceItem | null {
  return claimedCard === null
    ? giftPreviewCard(gift)
    : claimedDisplayCard(claimedCard, gift.preview);
}

export function giftSource(
  gift: CardGiftDeepLink,
  claimed: GiftCard[] | null,
  card: GiftCard | null
): string {
  const previewSource = gift.preview?.collectionTitle?.trim() ?? "";
  if (claimed === null) return previewSource;
  return card?.collectionTitle?.trim() || previewSource;
}
