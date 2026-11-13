import { CARD_KINDS, CARD_RARITIES, CARD_VARIANTS } from "@/config/cards/labels.config";
import type { CardGiftStack, OpenedCard } from "@/types/api/cards";
import type {
  CardGiftDeepLink,
  CardGiftPreview,
  CardGiftReceiptDeepLink,
} from "@/types/core/deeplink";

const GIFT_PREFIX = "iluhaanime://card/gift/";
const GIFT_RECEIPT_PREFIX = `${GIFT_PREFIX}receipt/`;
const GIFT_MAX_CHARS = 4096;
const GIFT_ID_RX = /^[A-Za-z0-9_-]{1,96}$/;
const BASE64URL_RX = /^[A-Za-z0-9_-]+$/;
const PREVIEW_TITLE_MAX = 200;
const PREVIEW_URL_MAX = 2048;

interface GiftPayload {
  readonly cards: CardGiftStack[];
  readonly preview?: CardGiftPreview;
}

function encodeBase64(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/[=]+$/, "");
}

function decodeBase64(raw: string): unknown {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function parsePreview(value: unknown): CardGiftPreview | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim().slice(0, PREVIEW_TITLE_MAX) : "";
  if (title === "") return null;
  const collectionTitle =
    typeof row.collectionTitle === "string"
      ? row.collectionTitle.trim().slice(0, PREVIEW_TITLE_MAX)
      : "";
  const imageUrl = parsePreviewUrl(row.imageUrl);
  const collage = Array.isArray(row.collage)
    ? row.collage
        .slice(0, 4)
        .map(parsePreviewUrl)
        .filter((url): url is string => url !== null)
    : [];
  return {
    title,
    imageUrl,
    collage,
    collectionTitle: collectionTitle === "" ? null : collectionTitle,
  };
}

function parsePreviewUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (url === "" || url.length > PREVIEW_URL_MAX) return null;
  return /^https?:\/\//iu.test(url) ? url : null;
}

function decodeCards(value: unknown): CardGiftStack[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return null;
  const cards: CardGiftStack[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const card = entry as Record<string, unknown>;
    if (!CARD_RARITIES.includes(card.rarity as (typeof CARD_RARITIES)[number])) return null;
    if (!CARD_VARIANTS.includes(card.variant as (typeof CARD_VARIANTS)[number])) return null;
    if (!Number.isSafeInteger(card.copies) || (card.copies as number) < 1) return null;
    if ((card.copies as number) > 1_000_000) return null;
    if (!Number.isSafeInteger(card.value) || (card.value as number) < 1) return null;
    if (!Number.isSafeInteger(card.firstObtainedAt) || (card.firstObtainedAt as number) < 0) {
      return null;
    }
    if (!Number.isSafeInteger(card.lastObtainedAt) || (card.lastObtainedAt as number) < 0) {
      return null;
    }
    if ((card.lastObtainedAt as number) < (card.firstObtainedAt as number)) return null;
    cards.push({
      rarity: card.rarity as CardGiftStack["rarity"],
      variant: card.variant as CardGiftStack["variant"],
      copies: card.copies as number,
      value: card.value as number,
      firstObtainedAt: card.firstObtainedAt as number,
      lastObtainedAt: card.lastObtainedAt as number,
    });
  }
  return cards;
}

function decodePayload(raw: string): GiftPayload | null {
  try {
    const parsed = decodeBase64(raw);
    if (Array.isArray(parsed)) {
      const cards = decodeCards(parsed);
      return cards === null ? null : { cards };
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const row = parsed as Record<string, unknown>;
    const cards = decodeCards(row.cards);
    if (cards === null) return null;
    const preview = parsePreview(row.preview);
    return preview === null ? { cards } : { cards, preview };
  } catch {
    return null;
  }
}

function parseCommon(
  giftId: string,
  kind: string,
  entityIdRaw: string
): Pick<CardGiftDeepLink, "giftId" | "kind" | "entityId"> | null {
  if (!GIFT_ID_RX.test(giftId)) return null;
  if (!/^\d{1,10}$/.test(entityIdRaw)) return null;
  const entityId = Number(entityIdRaw);
  if (!Number.isSafeInteger(entityId) || entityId < 1) return null;
  if (!CARD_KINDS.includes(kind as (typeof CARD_KINDS)[number])) return null;
  return { giftId, kind: kind as CardGiftDeepLink["kind"], entityId };
}

export function cardGiftPreview(
  card: Pick<OpenedCard, "title" | "imageUrl" | "collage" | "collectionTitle">
): CardGiftPreview {
  return {
    title: card.title,
    imageUrl: card.imageUrl,
    collage: card.collage,
    collectionTitle: card.collectionTitle,
  };
}

/** The first path segment is the opaque gift id, not a display name. */
export function buildCardGiftLink(gift: CardGiftDeepLink): string {
  const base = `${GIFT_PREFIX}${gift.giftId}/${gift.kind}/${gift.entityId}/`;
  const cardsLink = `${base}${encodeBase64(gift.cards)}`;
  if (gift.preview === undefined) return cardsLink;
  const previewLink = `${base}${encodeBase64({ cards: gift.cards, preview: gift.preview })}`;
  // Keep sharing working when a long studio collage would push the link over the cap.
  return previewLink.length <= GIFT_MAX_CHARS ? previewLink : cardsLink;
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
  if (parts.length === 4) {
    const [giftId, kind, entityIdRaw, payload] = parts;
    const common = parseCommon(giftId, kind, entityIdRaw);
    if (!common || !BASE64URL_RX.test(payload)) return null;
    const decoded = decodePayload(payload);
    return decoded ? { ...common, ...decoded } : null;
  }
  // Older links carried one rarity/variant and an optional frozen value.
  if (parts.length !== 5 && parts.length !== 6) return null;
  const [giftId, kind, entityIdRaw, rarity, variant, valueRaw] = parts;
  const common = parseCommon(giftId, kind, entityIdRaw);
  if (!common) return null;
  if (!CARD_RARITIES.includes(rarity as (typeof CARD_RARITIES)[number])) return null;
  if (!CARD_VARIANTS.includes(variant as (typeof CARD_VARIANTS)[number])) return null;
  let value = 0;
  if (valueRaw !== undefined) {
    if (!/^\d{1,10}$/.test(valueRaw)) return null;
    value = Number(valueRaw);
    if (!Number.isSafeInteger(value) || value < 1) return null;
  }
  return {
    ...common,
    cards: [
      {
        rarity: rarity as CardGiftStack["rarity"],
        variant: variant as CardGiftStack["variant"],
        copies: 1,
        value,
        firstObtainedAt: 0,
        lastObtainedAt: 0,
      },
    ],
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
