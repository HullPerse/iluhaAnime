import { describe, expect, it } from "vitest";

import { SEARCH_ALIASES } from "@/config/media/tokens.config";
import { finalizeSearchTitle } from "@/lib/media/video.utils";

describe("finalizeSearchTitle contract", () => {
  it("puts the arc after a colon", () => {
    expect(
      finalizeSearchTitle({ title: "Overlord", arc: "Sei Oukoku-hen", aliases: [] })
    ).toBe("Overlord: Sei Oukoku-hen");
  });

  it("puts the prefix before a colon", () => {
    expect(
      finalizeSearchTitle({
        title: "Boku no Hero Academia Illegals",
        prefix: "Vigilante",
        aliases: [],
      })
    ).toBe("Vigilante: Boku no Hero Academia Illegals");
  });

  it("does not duplicate a roman numeral already in the title", () => {
    expect(finalizeSearchTitle({ title: "Overlord IV", season: 4, aliases: [] })).toBe(
      "Overlord IV"
    );
  });

  it("appends an ordinal season when the title has no numeral", () => {
    expect(finalizeSearchTitle({ title: "Oshi No Ko", season: 2, aliases: [] })).toBe(
      "Oshi No Ko 2nd Season"
    );
  });

  it("prefers the alias over the season suffix", () => {
    expect(
      finalizeSearchTitle({
        title: "Re Zero kara Hajimeru Isekai Seikatsu III",
        season: 3,
        aliases: SEARCH_ALIASES,
      })
    ).toBe("Re:Zero kara Hajimeru Isekai Seikatsu");
  });

  it("maps a plain alias without season interference", () => {
    expect(
      finalizeSearchTitle({ title: "Bounen no Xamdou", aliases: SEARCH_ALIASES })
    ).toBe("Bounen no Zamned");
  });
});
