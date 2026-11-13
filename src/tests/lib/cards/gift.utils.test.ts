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
  rarity: "rare",
  variant: "foil",
  value: 12,
};

describe("card gift links", () => {
  it("round-trips the opaque gift id, card fields and frozen value", () => {
    const link = buildCardGiftLink(GIFT);
    expect(link).toBe(
      "iluhaanime://card/gift/gift-123-456/character/45627/rare/foil/12"
    );
    expect(parseCardGiftLink(link)).toEqual(GIFT);
  });

  it("still accepts an older link without a value", () => {
    expect(
      parseCardGiftLink(`  ILUHAANIME://card/gift/${GIFT.giftId}/anime/1/junk/normal  `)
    ).toEqual({
      ...GIFT,
      kind: "anime",
      entityId: 1,
      rarity: "junk",
      variant: "normal",
      value: null,
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
  });
});
