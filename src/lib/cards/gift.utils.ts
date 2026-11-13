import { CARD_KINDS, CARD_RARITIES, CARD_VARIANTS } from "@/config/cards/labels.config";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

const GIFT_PREFIX = "iluhaanime://card/gift/";
const GIFT_MAX_CHARS = 512;

/** The first path segment is the opaque gift id, not a display name. */
export function buildCardGiftLink(gift: CardGiftDeepLink): string {
  return `${GIFT_PREFIX}${gift.giftId}/${gift.kind}/${gift.entityId}/${gift.rarity}/${gift.variant}`;
}

export function parseCardGiftLink(raw: string): CardGiftDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > GIFT_MAX_CHARS) return null;
  if (trimmed.toLowerCase().indexOf(GIFT_PREFIX) !== 0) return null;
  const rest = trimmed.slice(GIFT_PREFIX.length);
  if (rest.includes("?") || rest.includes("#")) return null;
  const parts = rest.split("/");
  if (parts.length !== 5) return null;
  const [giftId, kind, entityIdRaw, rarity, variant] = parts;
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(giftId)) return null;
  if (!/^\d{1,10}$/.test(entityIdRaw)) return null;
  const entityId = Number(entityIdRaw);
  if (!Number.isSafeInteger(entityId) || entityId < 1) return null;
  if (!CARD_KINDS.includes(kind as (typeof CARD_KINDS)[number])) return null;
  if (!CARD_RARITIES.includes(rarity as (typeof CARD_RARITIES)[number])) return null;
  if (!CARD_VARIANTS.includes(variant as (typeof CARD_VARIANTS)[number])) return null;
  return {
    giftId,
    kind: kind as CardGiftDeepLink["kind"],
    entityId,
    rarity: rarity as CardGiftDeepLink["rarity"],
    variant: variant as CardGiftDeepLink["variant"],
  };
}
