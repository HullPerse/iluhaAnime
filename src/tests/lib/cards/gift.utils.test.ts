import { describe, expect, it } from "vitest";

import {
  buildCardGiftLink,
  buildCardGiftReceiptLink,
  parseCardGiftLink,
  parseCardGiftReceiptLink,
} from "@/lib/cards/gift.utils";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

const GIFT: CardGiftDeepLink = {
  giftId: "gift-123-456",
  kind: "character",
  entityId: 45627,
  preview: {
    title: "Леви Аккерман",
    imageUrl: "https://img/levi.jpg",
    collage: ["https://img/levi-1.jpg", "https://img/levi-2.jpg"],
    collectionTitle: "Атака титанов",
  },
  cards: [
    {
      rarity: "rare",
      variant: "foil",
      copies: 2,
      value: 12,
      firstObtainedAt: 1_760_000_000,
      lastObtainedAt: 1_760_000_100,
    },
    {
      rarity: "rare",
      variant: "normal",
      copies: 1,
      value: 8,
      firstObtainedAt: 1_760_000_200,
      lastObtainedAt: 1_760_000_200,
    },
  ],
};

describe("card gift links", () => {
  it("round-trips the opaque gift id, card identity and every stack", () => {
    const link = buildCardGiftLink(GIFT);
    expect(link.startsWith("iluhaanime://card/gift/gift-123-456/character/45627/")).toBe(true);
    expect(parseCardGiftLink(link)).toEqual(GIFT);
  });

  it("reads a four-segment stack link without a preview", () => {
    const legacy: CardGiftDeepLink = {
      giftId: GIFT.giftId,
      kind: GIFT.kind,
      entityId: GIFT.entityId,
      cards: GIFT.cards,
    };
    expect(parseCardGiftLink(buildCardGiftLink(legacy))).toEqual(legacy);
  });

  it("still accepts an older link without a value", () => {
    expect(
      parseCardGiftLink(`  ILUHAANIME://card/gift/${GIFT.giftId}/anime/1/junk/normal  `)
    ).toEqual({
      giftId: GIFT.giftId,
      kind: "anime",
      entityId: 1,
      cards: [
        {
          rarity: "junk",
          variant: "normal",
          copies: 1,
          value: 0,
          firstObtainedAt: 0,
          lastObtainedAt: 0,
        },
      ],
    });
  });

  it("round-trips a receipt link", () => {
    const link = buildCardGiftReceiptLink(GIFT.giftId);
    expect(link).toBe("iluhaanime://card/gift/receipt/gift-123-456");
    expect(parseCardGiftReceiptLink(link)).toEqual({ giftId: GIFT.giftId });
    expect(parseCardGiftLink(link)).toBeNull();
  });

  it("rejects a foreign scheme, wrong path and unknown enum values", () => {
    expect(parseCardGiftLink("https://example.com/card/gift/x/anime/1/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gifts/x/anime/1/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/demon/1/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/perfect/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/rare/shiny")).toBeNull();
  });

  it("rejects bad ids, values, extra segments and oversized links", () => {
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/0/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/12a/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/rare/normal/0")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/rare/normal/-1")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/rare/normal/extra")).toBeNull();
    expect(
      parseCardGiftLink(`iluhaanime://card/gift/${"a".repeat(500)}/anime/1/rare/normal`)
    ).toBeNull();
    expect(parseCardGiftLink(`iluhaanime://card/gift/x/anime/1/${"a".repeat(5000)}`)).toBeNull();
  });

  it("rejects a malformed bundle payload", () => {
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/not-base64!")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/YWJj")).toBeNull();
  });
});
