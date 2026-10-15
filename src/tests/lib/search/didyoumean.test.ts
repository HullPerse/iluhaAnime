import { describe, expect, it } from "vitest";

import { resolveTitleQuery, suggestSpellingWithReason } from "@/lib/search/resolve.utils";
import { suggestSpelling } from "@/lib/search/suggestions.utils";
import { buildSymSpellFromTitles } from "@/lib/search/symspell.utils";
import type { AnimeTitle, SearchAnimeSuggestion } from "@/types/search";

function typed(
  id: number,
  title: string,
  variants: Array<{ kind: AnimeTitle["kind"]; language: AnimeTitle["language"]; title: string }>,
  extra?: Partial<SearchAnimeSuggestion>
): SearchAnimeSuggestion {
  return {
    aliases: [],
    favourite: false,
    id,
    score: null,
    status: "FINISHED",
    title,
    typedTitles: variants.map((entry) => ({ animeId: id, source: "anilist", ...entry })),
    ...extra,
  };
}

function entry(
  id: number,
  title: string,
  romaji?: string,
  extra?: Partial<SearchAnimeSuggestion>,
  ...aliases: Array<{ kind: AnimeTitle["kind"]; title: string }>
): SearchAnimeSuggestion {
  return typed(
    id,
    title,
    [
      { kind: "official", language: "en", title },
      ...(romaji ? [{ kind: "romaji" as const, language: "ro" as const, title: romaji }] : []),
      ...aliases.map((alias) => ({ ...alias, language: null })),
    ],
    extra
  );
}

const INDEX: SearchAnimeSuggestion[] = [
  entry(1, "Frieren: Beyond Journey's End", "Sousou no Frieren", undefined, {
    kind: "alias",
    title: "Frieren",
  }),
  entry(2, "Attack on Titan", "Shingeki no Kyojin", undefined, {
    kind: "alias",
    title: "AoT",
  }),
  entry(3, "Demon Slayer: Kimetsu no Yaiba", "Kimetsu no Yaiba"),
  entry(4, "Boku no Hero Academia", undefined, undefined, {
    kind: "alias",
    title: "My Hero Academia",
  }),
  entry(5, "Oshi no Ko"),
  entry(6, "Jujutsu Kaisen"),
  entry(7, "Spy x Family"),
  entry(8, "Hunter x Hunter (2011)"),
  entry(9, "Re:Zero"),
  entry(10, "Steins;Gate"),
  entry(11, "Kono Subarashii Sekai ni Shukufuku wo!", undefined, undefined, {
    kind: "alias",
    title: "Konosuba",
  }),
  entry(12, "Overlord"),
  entry(13, "Kaijuu 8 Gou"),
  entry(14, "Horimiya"),
  entry(15, "Dandadan"),
  entry(
    16,
    "Naruto Shippuden",
    undefined,
    { favourite: true, score: 85 },
    {
      kind: "alias",
      title: "Naruto",
    }
  ),
  entry(17, "Naruto Surprise OVA", undefined, { score: 55 }),
  entry(18, "One Piece"),
  entry(19, "Vinland Saga"),
  entry(20, "Cowboy Bebop"),
  entry(21, "March comes in like a lion", "3-gatsu no Lion"),
  entry(22, "March comes in like a lion Season 2", "3-gatsu no Lion 2nd Season"),
];

describe("search/didyoumean phrase", () => {
  it("highlights the whole title when the typo resolves to one anime", () => {
    const fixed = suggestSpellingWithReason("sousou no frriren", { animeIndex: INDEX });
    expect(fixed).toMatchObject({
      correction: "Sousou no Frieren",
      reason: "typo",
      titleId: 1,
    });
    expect(fixed?.confidence ?? 0).toBeGreaterThanOrEqual(60);
    expect(fixed?.spans).toEqual([
      {
        start: 0,
        end: 17,
        severity: "warn",
        word: "sousou no frriren",
        corrected: "Sousou no Frieren",
      },
    ]);
  });

  it("falls back to word spans without a title index", () => {
    const fixed = suggestSpellingWithReason("sousou no frriren", {
      history: ["sousou no frieren"],
    });
    expect(fixed).toMatchObject({ correction: "sousou no frieren", titleId: undefined });
    expect(fixed?.spans).toEqual([
      { start: 10, end: 17, severity: "error", word: "frriren", corrected: "frieren" },
    ]);
  });

  it("keeps season markers on phrase corrections", () => {
    expect(
      suggestSpellingWithReason("Boku no Hero Akademia S8", { animeIndex: INDEX })
    ).toMatchObject({ correction: "Boku no Hero Academia S8", titleId: 4 });
  });
});

describe("search/didyoumean compound", () => {
  const words = ["sousou", "no", "frieren", "attack", "titan", "naruto"];

  it("segments a glued title into words", () => {
    const sym = buildSymSpellFromTitles(["Sousou no Frieren", "Attack on Titan"]);
    expect(sym.suggest("sousounofrieren")).toBe("sousou no frieren");
    expect(words).toContain("no");
  });

  it("joins a split word and then corrects it", () => {
    expect(suggestSpelling("fri ren", { history: ["frieren"] })).toBe("frieren");
  });

  it("leaves exact multi-word titles alone", () => {
    expect(suggestSpelling("attack on titan", { animeIndex: INDEX })).toBeNull();
    expect(suggestSpelling("hunter x hunter", { animeIndex: INDEX })).toBeNull();
    expect(suggestSpelling("spy x family", { animeIndex: INDEX })).toBeNull();
  });
});

describe("search/didyoumean damerau", () => {
  it("charges one edit for a transposition", () => {
    expect(suggestSpelling("freiren", { history: ["frieren"] })).toBe("frieren");
    expect(suggestSpelling("teh", { history: ["the"] })).toBe("the");
  });
});

describe("search/didyoumean length gate", () => {
  it("never corrects tiny tokens", () => {
    expect(suggestSpelling("s2", { history: ["spy", "s2"] })).toBeNull();
    expect(suggestSpelling("no", { history: ["naruto", "no"] })).toBeNull();
    expect(suggestSpelling("x", { history: ["x", "xen"] })).toBeNull();
  });

  it("fixes the typo but keeps the marker when both are present", () => {
    expect(suggestSpellingWithReason("friren s5", { animeIndex: INDEX })).toMatchObject({
      correction: "Frieren s5",
      reason: "typo",
    });
  });
});

describe("search/didyoumean keyboard", () => {
  it("breaks edit-distance ties by key proximity", () => {
    const sym = buildSymSpellFromTitles(["beer", "beek"]);
    expect(sym.suggest("bee5")).toBe("beer");
  });
});

describe("search/didyoumean transliteration", () => {
  const cases: Array<[query: string, correction: string]> = [
    ["soso no frieren", "Sousou no Frieren"],
    ["shingeki no kyoujin", "Shingeki no Kyojin"],
    ["jujutu kaisen", "Jujutsu Kaisen"],
  ];
  it.each(cases)("folds %s to %s", (query, correction) => {
    expect(suggestSpellingWithReason(query, { animeIndex: INDEX })).toMatchObject({
      correction,
    });
  });

  it("marks ou-variants as transliteration", () => {
    expect(suggestSpellingWithReason("soso no frieren", { animeIndex: INDEX })?.reason).toBe(
      "transliteration"
    );
  });
});

describe("search/didyoumean season siblings", () => {
  it("attributes a typo to the season whose title actually matches", () => {
    expect(
      suggestSpellingWithReason("3-gtsu no Lion 2nd Season", { animeIndex: INDEX })
    ).toMatchObject({
      correction: "3-gatsu no Lion 2nd Season",
      titleId: 22,
    });
  });

  it("keeps exact season titles silent", () => {
    expect(
      suggestSpellingWithReason("3-gatsu no Lion 2nd Season", { animeIndex: INDEX })
    ).toBeNull();
  });

  it("breaks remainder ties by the season number in the title", () => {
    const seasons = [
      entry(23, "Shingeki no Kyojin Season 3", "Shingeki no Kyojin Season 3"),
      entry(24, "Shingeki no Kyojin Season 4", "Shingeki no Kyojin Season 4"),
    ];
    expect(
      resolveTitleQuery("Shingeki no Kyojin 4th Season", { animeIndex: seasons })[0]
    ).toMatchObject({
      animeId: 24,
      season: 4,
    });
    expect(
      resolveTitleQuery("Shingeki no Kyojin 3rd Season", { animeIndex: seasons })[0]
    ).toMatchObject({
      animeId: 23,
      season: 3,
    });
  });

  it("reads filenames that say Gekijouban where AniList says Movie", () => {
    const movies = [entry(25, "Kimetsu no Yaiba Movie: Mugen Ressha-hen")];
    expect(
      resolveTitleQuery("Gekijouban Kimetsu no Yaiba Mugen Ressha Hen", { animeIndex: movies })[0]
    ).toMatchObject({ animeId: 25 });
    expect(
      suggestSpellingWithReason("Gekijouban Kimetsu no Yaiba Mugen Ressha Hen", {
        animeIndex: movies,
      })
    ).toBeNull();
  });
});

describe("search/didyoumean popularity", () => {
  it("lets a closer rare title beat a popular one", () => {
    expect(suggestSpellingWithReason("naruto surpris", { animeIndex: INDEX })).toMatchObject({
      titleId: 17,
    });
  });

  it("prefers the official popular title on a tie", () => {
    const fixed = suggestSpellingWithReason("vinland sag", { animeIndex: INDEX });
    expect(fixed).toMatchObject({ correction: "Vinland Saga", titleId: 19 });
  });

  it("prefers personal history over a popular partial", () => {
    expect(
      suggestSpellingWithReason("friren", {
        animeIndex: [INDEX[15]!],
        history: ["frisen"],
      })?.correction
    ).toBe("frisen");
  });
});

describe("search/didyoumean release names", () => {
  it("never invents corrections for exact release names", () => {
    const names = [
      "[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen [BDRip 1080p x265 FLAC]",
      "Shingeki.no.Kyojin.Movie.Kanketsu-hen.WEB-DL.1080p-SOFCJ",
      "Ксам'д - Позабывший невзгоды [BDRip 1080]",
      "Haikyu!! 2nd Season [BDRip 1080p HEVC 10bit FLAC]",
    ];
    for (const name of names) {
      expect(suggestSpellingWithReason(name, { animeIndex: INDEX }), name).toBeNull();
    }
  });

  it("routes season markers on release names through wrong_season", () => {
    expect(
      suggestSpellingWithReason("[SubsPlus+] Oshi No Ko S2 [WEB-DL 1080p x264 DDP]", {
        animeIndex: INDEX,
      })
    ).toMatchObject({ correction: "Oshi no Ko", reason: "wrong_season" });
  });

  it("fixes a typo inside a release name and keeps the markers", () => {
    expect(
      suggestSpellingWithReason("Boku.no.Hero.Akademia.S8.WEB-DL.1080p", { animeIndex: INDEX })
    ).toMatchObject({ correction: "Boku no Hero Academia S8", titleId: 4 });
  });

  it("stays null-safe on garbage with tags", () => {
    expect(
      suggestSpellingWithReason("Look.Back.2024.1080p.AMZN.WEB-DL.DDP5.1.H.264.ToonsHub", {
        animeIndex: INDEX,
      })
    ).toBeNull();
    expect(suggestSpellingWithReason("xyz123", { animeIndex: INDEX })).toBeNull();
  });
});

describe("search/didyoumean anilist shapes", () => {
  it("resolves romaji, alias and punctuation titles with typos", () => {
    expect(suggestSpellingWithReason("aot", { animeIndex: INDEX })).toMatchObject({
      correction: "Attack on Titan",
      reason: "alias",
    });
    expect(suggestSpellingWithReason("konosuba", { animeIndex: INDEX })).toMatchObject({
      correction: "Kono Subarashii Sekai ni Shukufuku wo!",
      reason: "alias",
    });
    expect(suggestSpellingWithReason("steins gat", { animeIndex: INDEX })).toMatchObject({
      correction: "Steins;Gate",
      titleId: 10,
    });
    expect(suggestSpellingWithReason("re zer", { animeIndex: INDEX })).toMatchObject({
      correction: "Re:Zero",
      titleId: 9,
    });
    expect(suggestSpellingWithReason("kaiju 8 go", { animeIndex: INDEX })).toMatchObject({
      titleId: 13,
    });
  });
});
