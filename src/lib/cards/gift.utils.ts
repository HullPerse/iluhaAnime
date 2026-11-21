import { attemptSync } from "@hullperse/hp_utils/attempt";

import { isCardKind, isCardRarity, isCardVariant } from "@/lib/cards/guards.utils";
import type { CardGiftStack, OpenedCard } from "@/types/api/cards";
import type { GiftPayload } from "@/types/ui/collection";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePreview(value: unknown): CardGiftPreview | null {
  if (!isRecord(value)) return null;
  const row = value;
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

function decodeCard(value: unknown): CardGiftStack | null {
  if (!isRecord(value)) return null;
  const card = value;
  if (typeof card.rarity !== "string" || !isCardRarity(card.rarity)) return null;
  if (typeof card.variant !== "string" || !isCardVariant(card.variant)) return null;
  if (typeof card.copies !== "number" || !Number.isSafeInteger(card.copies)) return null;
  if (card.copies < 1 || card.copies > 1_000_000) return null;
  if (typeof card.value !== "number" || !Number.isSafeInteger(card.value) || card.value < 1) {
    return null;
  }
  if (
    typeof card.firstObtainedAt !== "number" ||
    !Number.isSafeInteger(card.firstObtainedAt) ||
    card.firstObtainedAt < 0
  ) {
    return null;
  }
  if (
    typeof card.lastObtainedAt !== "number" ||
    !Number.isSafeInteger(card.lastObtainedAt) ||
    card.lastObtainedAt < 0
  ) {
    return null;
  }
  if (card.lastObtainedAt < card.firstObtainedAt) return null;
  return {
    rarity: card.rarity,
    variant: card.variant,
    copies: card.copies,
    value: card.value,
    firstObtainedAt: card.firstObtainedAt,
    lastObtainedAt: card.lastObtainedAt,
  };
}

function decodeCards(value: unknown): CardGiftStack[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return null;
  const cards: CardGiftStack[] = [];
  for (const entry of value) {
    const card = decodeCard(entry);
    if (card === null) return null;
    cards.push(card);
  }
  return cards;
}

function decodePayload(raw: string): GiftPayload | null {
  const [payload, error] = attemptSync((): GiftPayload | null => {
    const parsed = decodeBase64(raw);
    if (Array.isArray(parsed)) {
      const cards = decodeCards(parsed);
      return cards === null ? null : { cards };
    }
    if (!isRecord(parsed)) return null;
    const cards = decodeCards(parsed.cards);
    if (cards === null) return null;
    const preview = parsePreview(parsed.preview);
    return preview === null ? { cards } : { cards, preview };
  });
  return error === null ? payload : null;
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
  if (!isCardKind(kind)) return null;
  return { giftId, kind, entityId };
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
  if (parts.length !== 5 && parts.length !== 6) return null;
  const [giftId, kind, entityIdRaw, rarity, variant, valueRaw] = parts;
  const common = parseCommon(giftId, kind, entityIdRaw);
  if (!common) return null;
  if (!isCardRarity(rarity)) return null;
  if (!isCardVariant(variant)) return null;
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
        rarity,
        variant,
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
