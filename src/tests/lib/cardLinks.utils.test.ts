import { describe, expect, it } from "vitest";

import { anilistCardUrl } from "@/lib/cards/links.utils";
import type { CardKind } from "@/types/api/cards";

function card(kind: CardKind, entityId = 42) {
  return { kind, entityId };
}

describe("anilistCardUrl", () => {
  it("opens staff and studio profile pages on AniList", () => {
    expect(anilistCardUrl(card("staff"))).toBe("https://anilist.co/staff/42");
    expect(anilistCardUrl(card("studio"))).toBe("https://anilist.co/studio/42");
  });

  it("does not create a profile link for other card kinds", () => {
    expect(anilistCardUrl(card("anime"))).toBeNull();
    expect(anilistCardUrl(card("manga"))).toBeNull();
    expect(anilistCardUrl(card("character"))).toBeNull();
  });
});
