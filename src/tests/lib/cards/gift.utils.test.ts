import { describe, expect, it } from "vitest";

import { buildCardGiftLink, parseCardGiftLink } from "@/lib/cards/gift.utils";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

const GIFT: CardGiftDeepLink = {
  giftId: "gift-123-456",
  kind: "character",
  entityId: 45627,
  rarity: "rare",
  variant: "foil",
};

describe("card gift links", () => {
  it("round-trips the opaque gift id and card fields", () => {
    const link = buildCardGiftLink(GIFT);
    expect(link).toBe(
      "iluhaanime://card/gift/gift-123-456/character/45627/rare/foil"
    );
    expect(parseCardGiftLink(link)).toEqual(GIFT);
  });

  it("accepts an uppercase scheme and surrounding whitespace", () => {
    expect(parseCardGiftLink(`  ILUHAANIME://card/gift/${GIFT.giftId}/anime/1/junk/normal  `)).toEqual(
      { ...GIFT, kind: "anime", entityId: 1, rarity: "junk", variant: "normal" }
    );
  });

  it("rejects a foreign scheme, wrong path and unknown enum values", () => {
    expect(parseCardGiftLink("https://example.com/card/gift/x/anime/1/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gifts/x/anime/1/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/demon/1/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/perfect/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/rare/shiny")).toBeNull();
  });

  it("rejects bad ids, extra segments and oversized links", () => {
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/0/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/12a/rare/normal")).toBeNull();
    expect(parseCardGiftLink("iluhaanime://card/gift/x/anime/1/rare/normal/extra")).toBeNull();
    expect(
      parseCardGiftLink(`iluhaanime://card/gift/${"a".repeat(500)}/anime/1/rare/normal`)
    ).toBeNull();
  });
});
