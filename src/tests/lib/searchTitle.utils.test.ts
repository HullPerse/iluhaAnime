import { describe, expect, it } from "vitest";

import { getSearchSuggestions } from "@/lib/core/suggestions.utils";
import { buildTypedTitles, titleKindBonus, typedTitlesOf } from "@/lib/search/searchTitle.utils";
import type { SearchAnimeSuggestion } from "@/types/search/search";

describe("search/title", () => {
  it("marks english main title as official and keeps language tags", () => {
    const titles = buildTypedTitles(1, {
      title: "Frieren: Beyond Journey's End",
      title_english: "Frieren: Beyond Journey's End",
      title_native: "葬送のフリーレン",
      title_romaji: "Sousou no Frieren",
      titles: ["Frieren", "Sousou no Frieren"],
    });
    expect(titles[0]).toMatchObject({ kind: "official", language: "en" });
    expect(titles.some((entry) => entry.kind === "romaji" && entry.language === "ro")).toBe(true);
    expect(titles.some((entry) => entry.kind === "native" && entry.language === "ja")).toBe(true);
  });

  it("dedupes repeated variants into a single alias entry", () => {
    const titles = buildTypedTitles(2, { title: "Naruto", titles: ["Naruto", "Naruto "] });
    expect(titles).toHaveLength(1);
  });

  it("ranks official titles above plain aliases", () => {
    expect(titleKindBonus("official")).toBeGreaterThan(titleKindBonus("alias"));
    expect(titleKindBonus("obsolete")).toBeLessThan(0);
  });

  it("falls back to title plus aliases when typed titles are absent", () => {
    const anime = { aliases: ["SnK"], id: 3, title: "Shingeki no Kyojin" } as SearchAnimeSuggestion;
    const typed = typedTitlesOf(anime);
    expect(typed.map((entry) => entry.title)).toEqual(["Shingeki no Kyojin", "SnK"]);
    expect(typed[0]?.kind).toBe("official");
  });

  it("prefers official match over alias match at equal fuzzy score", () => {
    const official: SearchAnimeSuggestion = {
      aliases: ["zzz-unmatched"],
      favourite: false,
      id: 10,
      score: null,
      status: "FINISHED",
      title: "Frieren",
      typedTitles: [
        { animeId: 10, kind: "official", language: "en", source: "anilist", title: "Frieren" },
        { animeId: 10, kind: "alias", language: null, source: "anilist", title: "zzz-unmatched" },
      ],
    };
    const aliasOnly: SearchAnimeSuggestion = {
      aliases: ["Frieren"],
      favourite: false,
      id: 11,
      score: null,
      status: "FINISHED",
      title: "Sousou no Frieren long title",
      typedTitles: [
        {
          animeId: 11,
          kind: "official",
          language: "en",
          source: "anilist",
          title: "Sousou no Frieren long title",
        },
        { animeId: 11, kind: "alias", language: null, source: "anilist", title: "Frieren" },
      ],
    };
    const out = getSearchSuggestions("Frieren", { animeIndex: [aliasOnly, official], limit: 2 });
    expect(out[0]?.value).toBe("Frieren");
  });
});
