import { CARD_KINDS, CARD_RARITIES, CARD_VARIANTS } from "@/config/cards/labels.config";
import type { CardGiftDeepLink, CardGiftReceiptDeepLink } from "@/types/core/deeplink";

const GIFT_PREFIX = "iluhaanime://card/gift/";
const GIFT_RECEIPT_PREFIX = `${GIFT_PREFIX}receipt/`;
const GIFT_MAX_CHARS = 512;
const GIFT_ID_RX = /^[A-Za-z0-9_-]{1,96}$/;

/** The first path segment is the opaque gift id, not a display name. */
export function buildCardGiftLink(gift: CardGiftDeepLink): string {
  const value = gift.value === null ? "" : `/${gift.value}`;
  return `${GIFT_PREFIX}${gift.giftId}/${gift.kind}/${gift.entityId}/${gift.rarity}/${gift.variant}${value}`;
}

export function buildCardGiftReceiptLink(giftId: string): string {
  return `${GIFT_RECEIPT_PREFIX}${giftId}`;
}

export function parseCardGiftLink(raw: string): CardGiftDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > GIFT_MAX_CHARS) return null;
  if (trimmed.toLowerCase().indexOf(GIFT_PREFIX) !== 0) return null;
  const rest = trimmed.slice(GIFT_PREFIX.length);
  if (rest.includes("?") || rest.includes("#")) return null;
  const parts = rest.split("/");
  if (parts.length !== 5 && parts.length !== 6) return null;
  const [giftId, kind, entityIdRaw, rarity, variant, valueRaw] = parts;
  if (!GIFT_ID_RX.test(giftId)) return null;
  if (!/^\d{1,10}$/.test(entityIdRaw)) return null;
  const entityId = Number(entityIdRaw);
  if (!Number.isSafeInteger(entityId) || entityId < 1) return null;
  if (!CARD_KINDS.includes(kind as (typeof CARD_KINDS)[number])) return null;
  if (!CARD_RARITIES.includes(rarity as (typeof CARD_RARITIES)[number])) return null;
  if (!CARD_VARIANTS.includes(variant as (typeof CARD_VARIANTS)[number])) return null;
  let value: number | null = null;
  if (valueRaw !== undefined) {
    if (!/^\d{1,10}$/.test(valueRaw)) return null;
    value = Number(valueRaw);
    if (!Number.isSafeInteger(value) || value < 1) return null;
  }
  return {
    giftId,
    kind: kind as CardGiftDeepLink["kind"],
    entityId,
    rarity: rarity as CardGiftDeepLink["rarity"],
    variant: variant as CardGiftDeepLink["variant"],
    value,
  };
}

export function parseCardGiftReceiptLink(raw: string): CardGiftReceiptDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > GIFT_MAX_CHARS) return null;
  if (trimmed.toLowerCase().indexOf(GIFT_RECEIPT_PREFIX) !== 0) return null;
  const rest = trimmed.slice(GIFT_RECEIPT_PREFIX.length);
  if (rest.includes("/") || rest.includes("?") || rest.includes("#")) return null;
  if (!GIFT_ID_RX.test(rest)) return null;
  return { giftId: rest };
}
