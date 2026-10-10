import { describe, expect, it } from "vitest";

import {
  buildCoverQueries,
  cleanMusicSegment,
  findLocalMatch,
  findResolvedAlias,
  normalizeResolvedCover,
  pickCoverCandidate,
  resolveCover,
  scoreCoverCandidate,
  stripBracketGroups,
  withTimeout,
  type CoverCandidate,
} from "@/lib/search/cover.utils";

const naruto: CoverCandidate = { id: 20, romaji: "NARUTO", format: "TV", seasonYear: 2002 };
const shippuuden: CoverCandidate = {
  id: 1735,
  romaji: "NARUTO: Shippuuden",
  format: "TV",
  seasonYear: 2007,
};
const uruseiOld: CoverCandidate = {
  id: 101,
  romaji: "Urusei Yatsura",
  format: "TV",
  seasonYear: 1981,
};
const uruseiNew: CoverCandidate = {
  id: 143277,
  romaji: "Urusei Yatsura (2022)",
  format: "TV",
  seasonYear: 2022,
};
const overlordMovie: CoverCandidate = {
  id: 133845,
  romaji: "Overlord: Sei Oukoku-hen",
  format: "MOVIE",
  seasonYear: 2024,
};

describe("buildCoverQueries", () => {
  it("sends searchTitle first with the parsed format", () => {
    expect(buildCoverQueries({ title: "Naruto", searchTitle: "Naruto", kind: "tv" })).toEqual([
      { query: "Naruto", format: "TV" },
    ]);
  });

  it("maps movie kind to MOVIE and adds a Gekijouban-free form", () => {
    expect(
      buildCoverQueries({
        title: "Gekijouban Kimetsu no Yaiba",
        searchTitle: "Gekijouban Kimetsu no Yaiba: Mugen Ressha-hen",
        kind: "movie",
      })
    ).toEqual([
      { query: "Gekijouban Kimetsu no Yaiba: Mugen Ressha-hen", format: "MOVIE" },
      { query: "Gekijouban Kimetsu no Yaiba", format: "MOVIE" },
      { query: "Kimetsu no Yaiba: Mugen Ressha-hen Movie", format: "MOVIE" },
      { query: "Kimetsu no Yaiba Movie", format: "MOVIE" },
    ]);
  });

  it("attaches the parsed year as seasonYear", () => {
    expect(
      buildCoverQueries({ title: "Urusei Yatsura", searchTitle: "Urusei Yatsura", year: 2022 })
    ).toEqual([{ query: "Urusei Yatsura", format: "TV", seasonYear: 2022 }]);
  });

  it("falls back to the head before a colon", () => {
    expect(
      buildCoverQueries({
        title: "Youjo Senki: Sabaku no Pasta Dai Sakusen",
        searchTitle: "Youjo Senki: Sabaku no Pasta Dai Sakusen",
      })
    ).toEqual([
      { query: "Youjo Senki: Sabaku no Pasta Dai Sakusen", format: "TV" },
      { query: "Youjo Senki", format: "TV" },
    ]);
  });

  it("strips bracket groups from the raw fallback query", () => {
    expect(stripBracketGroups("[Erai-raws] Sousou no Frieren - 27 [1080p]")).toBe(
      "Sousou no Frieren - 27"
    );
    expect(stripBracketGroups("  (a)  [b]  ")).toBe("");
  });

  it("appends the stripped raw title last", () => {
    expect(
      buildCoverQueries(
        { title: "A", searchTitle: "A" },
        null,
        "[Erai-raws] Sousou no Frieren - 27 [1080p]"
      )
    ).toEqual([
      { query: "A", format: "TV" },
      { query: "Sousou no Frieren - 27", format: "TV" },
    ]);
  });

  it("skips an empty stripped raw title", () => {
    expect(buildCoverQueries({ title: "A", searchTitle: "A" }, null, "[1080p]")).toEqual([
      { query: "A", format: "TV" },
    ]);
  });
});

describe("pickCoverCandidate", () => {
  it("picks the exact title over same-franchise entries", () => {
    expect(
      pickCoverCandidate({ title: "Naruto", searchTitle: "Naruto" }, [shippuuden, naruto])
        ?.candidate.id
    ).toBe(20);
  });

  it("uses the year to tell remakes apart", () => {
    expect(
      pickCoverCandidate({ title: "Urusei Yatsura", searchTitle: "Urusei Yatsura", year: 2022 }, [
        uruseiOld,
        uruseiNew,
      ])?.candidate.id
    ).toBe(143277);
  });

  it("requires the movie format for films", () => {
    expect(
      pickCoverCandidate(
        {
          title: "Overlord",
          searchTitle: "Overlord: Sei Oukoku-hen",
          kind: "movie",
          arc: "Sei Oukoku-hen",
        },
        [overlordMovie]
      )?.candidate.id
    ).toBe(133845);
  });

  it("returns null below threshold", () => {
    expect(
      pickCoverCandidate({ title: "Tochno Ne Ampir", searchTitle: "Tochno Ne Ampir" }, [naruto])
    ).toBeNull();
  });

  it("skips rejected ids and falls to the next candidate", () => {
    expect(
      pickCoverCandidate(
        { title: "Naruto", searchTitle: "Naruto" },
        [naruto, shippuuden],
        new Set([20])
      )?.candidate.id
    ).toBe(1735);
  });

  it("returns null when every candidate is rejected", () => {
    expect(
      pickCoverCandidate({ title: "Naruto", searchTitle: "Naruto" }, [naruto], new Set([20]))
    ).toBeNull();
  });

  it("stops the cascade at the first confident hit", async () => {
    const calls: string[] = [];
    const backend = {
      search: async (query: { query: string }) => {
        calls.push(query.query);
        return [naruto];
      },
    };
    const resolution = await resolveCover({ title: "Naruto", searchTitle: "Naruto" }, backend);
    expect(resolution.pick?.candidate.id).toBe(20);
    expect(calls).toEqual(["Naruto"]);
  });

  it("searches an exact local title once before the cascade", async () => {
    const calls: string[] = [];
    const backend = {
      search: async (query: { query: string }) => {
        calls.push(query.query);
        return [naruto];
      },
    };
    const resolution = await resolveCover({ title: "NARUTO", searchTitle: "NARUTO" }, backend, {
      localTitle: "NARUTO",
      trustedIds: new Set([20]),
    });
    expect(resolution.pick?.candidate.id).toBe(20);
    expect(calls).toEqual(["NARUTO"]);
  });

  it("falls through to the cascade when the local title misses", async () => {
    const calls: string[] = [];
    const backend = {
      search: async (query: { query: string }) => {
        calls.push(query.query);
        return query.query === "Nothing Here" ? [] : [naruto];
      },
    };
    const resolution = await resolveCover({ title: "Naruto", searchTitle: "Naruto" }, backend, {
      localTitle: "Nothing Here",
    });
    expect(resolution.pick?.candidate.id).toBe(20);
    expect(calls[0]).toBe("Nothing Here");
    expect(calls).toContain("Naruto");
  });

  it("tries the next query when the first returns junk", async () => {
    const junk: CoverCandidate = { id: 1, romaji: "Cowboy Bebop", format: "TV" };
    const calls: string[] = [];
    const backend = {
      search: async (query: { query: string }) => {
        calls.push(query.query);
        return calls.length === 1 ? [junk] : [naruto];
      },
    };
    const resolution = await resolveCover(
      { title: "Naruto", searchTitle: "Naruto 2nd Season" },
      backend
    );
    expect(calls).toEqual(["Naruto 2nd Season", "Naruto"]);
    expect(resolution.pick?.candidate.id).toBe(20);
  });

  it("retries once when every query returns nothing", async () => {
    let calls = 0;
    let delays = 0;
    const backend = {
      search: async () => {
        calls += 1;
        return [];
      },
      delay: async () => {
        delays += 1;
      },
    };
    const resolution = await resolveCover({ title: "Nope", searchTitle: "Nope" }, backend);
    expect(resolution.pick).toBeNull();
    expect(calls).toBe(2);
    expect(delays).toBe(1);
  });
  it("ignores brackets and punctuation when matching", () => {
    expect(
      pickCoverCandidate({ title: "Oshi No Ko", searchTitle: "Oshi No Ko 2nd Season" }, [
        { id: 166531, romaji: "[Oshi no Ko] 2nd Season", format: "TV", seasonYear: 2024 },
      ])?.candidate.id
    ).toBe(166531);
  });
  it("rewards arc words inside candidate titles", () => {
    const arcMatch: CoverCandidate = {
      id: 166240,
      romaji: "Kimetsu no Yaiba: Hashira Geiko-hen",
      format: "TV",
    };
    const plain: CoverCandidate = { id: 38000, romaji: "Kimetsu no Yaiba", format: "TV" };
    expect(
      scoreCoverCandidate(
        {
          title: "Kimetsu no Yaiba",
          searchTitle: "Kimetsu no Yaiba: Hashira Geiko-hen",
          arc: "Hashira Geiko-hen",
        },
        arcMatch
      )
    ).toBeGreaterThan(
      scoreCoverCandidate(
        {
          title: "Kimetsu no Yaiba",
          searchTitle: "Kimetsu no Yaiba: Hashira Geiko-hen",
          arc: "Hashira Geiko-hen",
        },
        plain
      )
    );
  });

  it("treats a learned title as decisive even without text overlap", () => {
    const russian: CoverCandidate = { id: 20, romaji: "NARUTO", format: "TV" };
    expect(scoreCoverCandidate({ title: "Наруто", searchTitle: "Наруто" }, russian)).toBeLessThan(
      45
    );
    expect(
      pickCoverCandidate({ title: "Наруто", searchTitle: "Наруто" }, [russian], new Set(), "NARUTO")
        ?.candidate.id
    ).toBe(20);
  });

  it("trusts locally matched ids without text overlap", () => {
    const candidate: CoverCandidate = { id: 16498, romaji: "Shingeki no Kyojin", format: "TV" };
    expect(
      scoreCoverCandidate({ title: "Атака титанов", searchTitle: "Атака титанов" }, candidate)
    ).toBe(0);
    expect(
      scoreCoverCandidate(
        { title: "Атака титанов", searchTitle: "Атака титанов" },
        candidate,
        null,
        new Set([16498])
      )
    ).toBe(100);
  });

  it("picks the matching season over an exact base-title candidate", () => {
    const s1: CoverCandidate = { id: 11, romaji: "Sousou no Frieren", format: "TV" };
    const s2: CoverCandidate = { id: 22, romaji: "Sousou no Frieren 2nd Season", format: "TV" };
    expect(
      pickCoverCandidate(
        { title: "Sousou no Frieren", searchTitle: "Sousou no Frieren 2nd Season", season: 2 },
        [s1, s2]
      )?.candidate.id
    ).toBe(22);
  });

  it("finds exact names and synonyms in the local index", () => {
    const index = [
      { id: 16498, title: "Shingeki no Kyojin", aliases: ["Attack on Titan", "Атака титанов"] },
      { id: 20, title: "NARUTO", aliases: [] },
    ];
    expect(findLocalMatch({ title: "Атака титанов", searchTitle: "Атака титанов" }, index)).toEqual(
      { id: 16498, title: "Shingeki no Kyojin" }
    );
    expect(findLocalMatch({ title: "Naruto", searchTitle: "Naruto" }, index)).toEqual({
      id: 20,
      title: "NARUTO",
    });
    expect(findLocalMatch({ title: "Nope", searchTitle: "Nope" }, index)).toBeNull();
  });

  it("prefers the season-qualified name over the bare base title", () => {
    const index = [
      { id: 11, title: "Sousou no Frieren", aliases: [] },
      { id: 22, title: "Sousou no Frieren 2nd Season", aliases: [] },
    ];
    expect(
      findLocalMatch(
        { title: "Sousou no Frieren", searchTitle: "Sousou no Frieren 2nd Season", season: 2 },
        index
      )
    ).toEqual({ id: 22, title: "Sousou no Frieren 2nd Season" });
  });

  it("refuses the base-season entry for a season-qualified query", () => {
    const index = [{ id: 11, title: "Sousou no Frieren", aliases: [] }];
    expect(
      findLocalMatch(
        { title: "Sousou no Frieren", searchTitle: "Sousou no Frieren 2nd Season", season: 2 },
        index
      )
    ).toBeNull();
    expect(
      findLocalMatch({ title: "Sousou no Frieren", searchTitle: "Sousou no Frieren" }, index)
    ).toEqual({ id: 11, title: "Sousou no Frieren" });
  });

  it("puts the local title first in the cascade", () => {
    expect(
      buildCoverQueries(
        { title: "Атака титанов", searchTitle: "Атака титанов" },
        "Shingeki no Kyojin"
      )
    ).toEqual([
      { query: "Shingeki no Kyojin", format: "TV" },
      { query: "Атака титанов", format: "TV" },
    ]);
  });

  it("lets profile context break text ties without overriding exact matches", () => {
    const base: CoverCandidate = { id: 20, romaji: "NARUTO", format: "TV" };
    const shippuuden: CoverCandidate = { id: 1735, romaji: "NARUTO: Shippuuden", format: "TV" };
    const parsed = { title: "Naruto", searchTitle: "Naruto" };
    expect(pickCoverCandidate(parsed, [shippuuden, base])?.candidate.id).toBe(20);
    expect(
      pickCoverCandidate(parsed, [
        { ...shippuuden, listStatus: "CURRENT", favourite: true, userScore: 9 },
        { ...base, listStatus: "COMPLETED", userScore: 8 },
      ])?.candidate.id
    ).toBe(20);
    expect(
      pickCoverCandidate(parsed, [{ ...shippuuden, listStatus: "DROPPED" }])?.candidate
    ).toBeUndefined();
  });

  it("lets CURRENT status break substring ties", () => {
    const base: CoverCandidate = { id: 154587, romaji: "Sousou no Frieren", format: "TV" };
    const second: CoverCandidate = {
      id: 182255,
      romaji: "Sousou no Frieren 2nd Season",
      format: "TV",
    };
    const parsed = { title: "Frieren", searchTitle: "Frieren" };
    expect(pickCoverCandidate(parsed, [base, second])?.candidate.id).toBe(154587);
    expect(
      pickCoverCandidate(parsed, [
        { ...second, listStatus: "CURRENT" },
        { ...base, listStatus: "COMPLETED" },
      ])?.candidate.id
    ).toBe(182255);
  });

  it("normalizes legacy resolved entries from the key", () => {
    expect(
      normalizeResolvedCover("sousou no frieren|0", {
        id: 154587,
        coverUrl: "http://cover",
        title: "Sousou no Frieren",
        at: 1,
      })
    ).toEqual({
      id: 154587,
      coverUrl: "http://cover",
      title: "Sousou no Frieren",
      at: 1,
      names: ["sousou no frieren"],
      season: 0,
    });
  });

  it("shares one resolved cover across title spellings of the same season", () => {
    const resolved = {
      "sousou no frieren|0": {
        id: 154587,
        coverUrl: "http://cover",
        title: "Sousou no Frieren",
        at: 1,
        names: ["sousou no frieren", "frieren beyond journey s end"],
        season: 0,
      },
    };
    expect(
      findResolvedAlias(resolved, { season: 0, names: ["Frieren: Beyond Journey's End"] })?.id
    ).toBe(154587);
  });

  it("refuses alias hits across seasons and years", () => {
    const resolved = {
      "sousou no frieren|1": {
        id: 154587,
        coverUrl: "http://cover",
        title: "Sousou no Frieren",
        at: 1,
        names: ["sousou no frieren"],
        season: 1,
        year: 2023,
      },
    };
    expect(findResolvedAlias(resolved, { season: 2, names: ["Sousou no Frieren"] })).toBeNull();
    expect(
      findResolvedAlias(resolved, { season: 1, names: ["Sousou no Frieren"], year: 2024 })
    ).toBeNull();
    expect(
      findResolvedAlias(resolved, { season: 1, names: ["Sousou no Frieren"], year: 2023 })?.id
    ).toBe(154587);
    expect(findResolvedAlias(resolved, { season: 1, names: ["", "  "] })).toBeNull();
    expect(findResolvedAlias({}, { season: 0, names: ["Sousou no Frieren"] })).toBeNull();
  });

  it("falls back to franchise matches when nothing passes threshold", () => {
    const film: CoverCandidate = { id: 1, romaji: "Gekijouban Youjo Senki", format: "MOVIE" };
    const parsed = {
      title: "Youjo Senki: Sabaku no Pasta Dai Sakusen",
      searchTitle: "Youjo Senki: Sabaku no Pasta Dai Sakusen",
      kind: "movie",
    };
    expect(pickCoverCandidate(parsed, [film])?.candidate.id).toBe(1);
  });

  it("rejects franchise matches with the wrong format", () => {
    const series: CoverCandidate = { id: 2, romaji: "Youjo Senki II", format: "TV" };
    const parsed = {
      title: "Youjo Senki: Sabaku no Pasta Dai Sakusen",
      searchTitle: "Youjo Senki: Sabaku no Pasta Dai Sakusen",
      kind: "movie",
    };
    expect(pickCoverCandidate(parsed, [series])).toBeNull();
  });

  it("withTimeout resolves fast tasks and releases stuck ones", async () => {
    await expect(withTimeout(Promise.resolve(1), 50, () => 2)).resolves.toBe(1);
    await expect(withTimeout(new Promise<number>(() => {}), 10, () => 3)).resolves.toBe(3);
  });

  it("prefers the candidate carrying the parsed season", () => {
    const s1: CoverCandidate = { id: 154587, romaji: "Sousou no Frieren", format: "TV" };
    const s2: CoverCandidate = { id: 182255, romaji: "Sousou no Frieren 2nd Season", format: "TV" };
    const parsed = {
      title: "Sousou no Frieren",
      searchTitle: "Sousou no Frieren 2nd Season",
      season: 2,
    };
    expect(pickCoverCandidate(parsed, [s1, s2])?.candidate.id).toBe(182255);
  });

  it("matches roman season numerals in candidate titles", () => {
    const base: CoverCandidate = { id: 1, romaji: "Overlord", format: "TV" };
    const fourth: CoverCandidate = { id: 2, romaji: "Overlord IV", format: "TV" };
    const parsed = { title: "Overlord", searchTitle: "Overlord IV", season: 4 };
    expect(pickCoverCandidate(parsed, [base, fourth])?.candidate.id).toBe(2);
  });

  it("prefers the base season when the parsed title has no season marker", () => {
    const s1: CoverCandidate = { id: 154587, romaji: "Sousou no Frieren", format: "TV" };
    const s2: CoverCandidate = { id: 182255, romaji: "Sousou no Frieren 2nd Season", format: "TV" };
    const parsed = { title: "Sousou no Frieren", searchTitle: "Sousou no Frieren" };
    expect(pickCoverCandidate(parsed, [s1, s2])?.candidate.id).toBe(154587);
    expect(pickCoverCandidate(parsed, [s2, s1])?.candidate.id).toBe(154587);
  });

  it("still picks a lone season sequel above threshold", () => {
    const s2: CoverCandidate = { id: 182255, romaji: "Sousou no Frieren 2nd Season", format: "TV" };
    const parsed = { title: "Sousou no Frieren", searchTitle: "Sousou no Frieren" };
    expect(pickCoverCandidate(parsed, [s2])?.candidate.id).toBe(182255);
  });

  it("strips music release junk from title segments", () => {
    expect(cleanMusicSegment("(OST) Sousou no Frieren Soundtracks Collection")).toBe(
      "Sousou no Frieren"
    );
    expect(cleanMusicSegment("Sousou no Frieren OST")).toBe("Sousou no Frieren");
    expect(
      cleanMusicSegment(
        "Фрирен, провожающая в последний путь (by Evan Call) - 2023-2026, MP3, 320 kbps (7 CD)"
      )
    ).toBe("Фрирен, провожающая в последний путь");
    expect(cleanMusicSegment("Frieren: Beyond Journey's End")).toBe(
      "Frieren: Beyond Journey's End"
    );
    expect(cleanMusicSegment("2023-2026, MP3")).toBe("");
    expect(cleanMusicSegment("Ghost in the Shell")).toBe("Ghost in the Shell");
  });

  it("queries cleaned alt titles before the composite title", () => {
    expect(
      buildCoverQueries({
        title: "A / B",
        searchTitle: "A / B",
        altTitles: [
          "(OST) Sousou no Frieren Soundtracks Collection",
          "Frieren: Beyond Journey's End",
        ],
      })
    ).toEqual([
      { query: "Sousou no Frieren", format: "TV" },
      { query: "Frieren: Beyond Journey's End", format: "TV" },
      { query: "A / B", format: "TV" },
    ]);
  });

  it("resolves a music release to the base season in any candidate order", async () => {
    const s1: CoverCandidate = { id: 154587, romaji: "Sousou no Frieren", format: "TV" };
    const s2: CoverCandidate = { id: 182255, romaji: "Sousou no Frieren 2nd Season", format: "TV" };
    const parsed = {
      title: "Sousou no Frieren Soundtracks Collection / Frieren: Beyond Journey's / Фрирен тест",
      searchTitle:
        "Sousou no Frieren Soundtracks Collection / Frieren: Beyond Journey's / Фрирен тест",
      altTitles: [
        "(OST) Sousou no Frieren Soundtracks Collection",
        "Frieren: Beyond Journey's End",
        "Фрирен тест",
      ],
    };
    for (const order of [
      [s1, s2],
      [s2, s1],
    ]) {
      const calls: string[] = [];
      const resolution = await resolveCover(parsed, {
        search: async (query: { query: string }) => {
          calls.push(query.query);
          return query.query === "Sousou no Frieren" ? order : [];
        },
        delay: async () => {},
      });
      expect(resolution.pick?.candidate.id).toBe(154587);
      expect(calls[0]).toBe("Sousou no Frieren");
    }
  });
});
