import { beforeEach, describe, expect, it } from "vitest";

import { detectLanguages, formatSize, parseSize, qualityMatch } from "@/lib/search/format.utils";
import { isTagLikeQuery, parseIntent, tokenizeIntent } from "@/lib/search/intent.utils";
import { MASCOT_DIM_COVERAGE, overlapCoverage, shouldDimMascot } from "@/lib/search/mascot.utils";
import { recencyBoost } from "@/lib/search/ranking.utils";
import { filterAnimeResults, sortAnimeResults } from "@/lib/search/results.utils";
import { mapError } from "@/lib/search/rutracker.utils";
import { matchOperatorTerms, parseOperatorTerms } from "@/lib/search/score.utils";
import {
  fuzzyMatchScore,
  getInlineCompletion,
  getSearchSuggestions,
  normalizeSearchText,
  suggestSpelling,
} from "@/lib/search/suggestions.utils";
import {
  buildShadow,
  buildShadowGradients,
  buildWallpaperFilter,
} from "@/lib/search/wallpaper.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { SearchAnimeSuggestion, SearchQueryStat } from "@/types/search";
import type { SearchFilters } from "@/types/search";
import type { Anime } from "@/types/torrent";

describe("search/format", () => {
  describe("detectLanguages", () => {
    it.each([
      ["[Erai-raws] Anime [1080p][RUS]", ["ru"]],
      ["[Erai-raws] Anime [1080p][ENG]", ["en"]],
      ["[Erai-raws] Anime [1080p][MultiSub]", ["multi"]],
      ["[Erai-raws] Anime [1080p][Dual-Audio]", ["dual"]],
      ["[Erai-raws] Anime [1080p][RUS][ENG]", ["en", "ru"]],
      ["[Some] Anime [1080p]", []],
    ] as const)("detects %s", (title, codes) => {
      expect(
        detectLanguages(title)
          .map((entry) => entry.code)
          .sort()
      ).toEqual([...codes].sort());
    });
  });

  describe("qualityMatch", () => {
    it.each([
      ["[Group] Anime Title [1080p][HEVC]", "1080p", true],
      ["[Group] Anime Title [720p]", "720p", true],
      ["[Group] Anime Title [HEVC]", "1080p", false],
      ["[Group] Anime [1080P]", "1080p", true],
    ] as const)("matches %s against %s as %s", (title, query, expected) => {
      expect(qualityMatch(title, query)).toBe(expected);
    });
  });

  describe("parseSize", () => {
    it.each([
      ["432.6 MiB", 432.6 * 1_048_576],
      ["1.5 GiB", 1.5 * 1_073_741_824],
      ["unknown", 0],
      ["512 B", 512],
    ] as const)("parses %s", (input, expected) => {
      expect(parseSize(input)).toBe(expected);
    });
  });

  describe("formatSize", () => {
    it.each([
      ["432.6 MiB", "432.60 MiB"],
      ["1.5 GiB", "1.50 GiB"],
      ["unknown", "unknown"],
    ] as const)("formats %s", (input, expected) => {
      expect(formatSize(input)).toBe(expected);
    });
  });
});

describe("search/intent", () => {
  describe("tokenizeIntent", () => {
    it("returns spans for known filter tokens", () => {
      expect(tokenizeIntent("studio=MAPPA frieren")).toEqual([
        { start: 0, end: 12, key: "studio", op: "=", value: "MAPPA" },
      ]);
    });

    it("keeps quoted values in one span", () => {
      const query = 'genre="sci fi" frieren';
      const tokens = tokenizeIntent(query);
      expect(tokens).toHaveLength(1);
      expect(query.slice(tokens[0]!.start, tokens[0]!.end)).toBe('genre="sci fi"');
    });
    it("ignores unknown keys and empty values", () => {
      expect(tokenizeIntent("foo:bar studio= year=2024")).toEqual([
        { start: 16, end: 25, key: "year", op: "=", value: "2024" },
      ]);
    });

    it("matches parseIntent filter keys", () => {
      const query = 'studio=MAPPA year=2024 genre="sci fi" frieren';
      const keys = tokenizeIntent(query)
        .map((t) => t.key)
        .sort();
      expect(keys).toEqual(Object.keys(parseIntent(query).rawFilters).sort());
    });

    it("skips colon filters", () => {
      expect(tokenizeIntent("studio:MAPPA year:2024")).toEqual([]);
    });
  });

  describe("parseIntent operators", () => {
    it("parses numeric comparisons for year and rating", () => {
      const intent = parseIntent("year>2020 rating>=8");
      expect(intent.cleanQuery).toBe("");
      expect(intent.yearOps).toEqual([{ op: ">", value: 2020 }]);
      expect(intent.ratingOps).toEqual([{ op: ">=", value: 8 }]);
    });

    it("keeps exact matches alongside operator ranges", () => {
      const intent = parseIntent("year>2020 year<2025 genre=action");
      expect(intent.year).toBeUndefined();
      expect(intent.yearOps).toEqual([
        { op: ">", value: 2020 },
        { op: "<", value: 2025 },
      ]);
      expect(intent.genre).toBe("action");
    });

    it("collects string negations without touching exact filters", () => {
      const intent = parseIntent("status!=completed studio!=MAPPA year=2024");
      expect(intent.year).toBe(2024);
      expect(intent.status).toBeUndefined();
      expect(intent.negations).toEqual([
        { key: "status", value: "completed" },
        { key: "studio", value: "MAPPA" },
      ]);
    });

    it("treats = like an exact match", () => {
      const intent = parseIntent("year=2024");
      expect(intent.year).toBe(2024);
      expect(intent.yearOps).toEqual([]);
    });

    it("parses episodes exact and comparisons", () => {
      const exact = parseIntent("episodes=24");
      expect(exact.episodes).toBe(24);
      const range = parseIntent("episodes>12 episodes!=24");
      expect(range.episodesOps).toEqual([
        { op: ">", value: 12 },
        { op: "!=", value: 24 },
      ]);
    });
    it("parses sort field with optional direction", () => {
      expect(parseIntent("sort=rating")).toMatchObject({ sortBy: "rating", sortDir: "desc" });
      expect(parseIntent("sort=name:asc")).toMatchObject({ sortBy: "name", sortDir: "asc" });
      expect(parseIntent("sort=year")).toMatchObject({ sortBy: "year", sortDir: "desc" });
      expect(parseIntent("sort=season").sortBy).toBeUndefined();
    });

    it("parses progress exact and comparisons", () => {
      const intent = parseIntent("progress=0 progress>5");
      expect(intent.progress).toBe(0);
      expect(intent.progressOps).toEqual([{ op: ">", value: 5 }]);
    });

    it("treats colon filters as plain text", () => {
      expect(parseIntent("year:2024").cleanQuery).toBe("year:2024");
      expect(parseIntent("year:2024").year).toBeUndefined();
    });

    it("joins operators separated by spaces", () => {
      const intent = parseIntent("year >= 2020 rating >= 8");
      expect(intent.cleanQuery).toBe("");
      expect(intent.yearOps).toEqual([{ op: ">=", value: 2020 }]);
      expect(intent.ratingOps).toEqual([{ op: ">=", value: 8 }]);
    });

    it("accepts comma decimals in rating", () => {
      expect(parseIntent("rating>=8,5").ratingOps).toEqual([{ op: ">=", value: 8.5 }]);
    });

    it("keeps unparsable filters in the text query", () => {
      expect(parseIntent("year>=1800").cleanQuery).toBe("year>=1800");
      expect(parseIntent("year>=1800").yearOps).toEqual([]);
      expect(parseIntent("rating>=99").cleanQuery).toBe("rating>=99");
      expect(parseIntent("sort=bogus").cleanQuery).toBe("sort=bogus");
    });

    it("parses date in year, RU, and ISO forms", () => {
      expect(parseIntent("date=2024").dateConds).toEqual([
        { op: "=", iso: "2024", yearOnly: true },
      ]);
      expect(parseIntent('date="31.01.2025"').dateConds).toEqual([
        { op: "=", iso: "2025-01-31", yearOnly: false },
      ]);
      expect(parseIntent("date>=2025-01-31").dateConds).toEqual([
        { op: ">=", iso: "2025-01-31", yearOnly: false },
      ]);
      expect(parseIntent("date >= 2024").dateConds).toEqual([
        { op: ">=", iso: "2024", yearOnly: true },
      ]);
    });

    it("keeps invalid dates in the text query", () => {
      expect(parseIntent("date=32.13.2024").cleanQuery).toBe("date=32.13.2024");
      expect(parseIntent("date=32.13.2024").dateConds).toEqual([]);
    });
  });

  describe("parseIntent approximate and range", () => {
    it("desugars ~= into a tolerance band with defaults", () => {
      expect(parseIntent("year~=2020").yearOps).toEqual([
        { op: ">=", value: 2018 },
        { op: "<=", value: 2022 },
      ]);
      expect(parseIntent("year~=2020").cleanQuery).toBe("");
    });

    it("honors custom tolerances", () => {
      const intent = parseIntent("rating~=8", { year: 2, rating: 0, episodes: 2, progress: 5 });
      expect(intent.ratingOps).toEqual([
        { op: ">=", value: 8 },
        { op: "<=", value: 8 },
      ]);
    });

    it("treats ~= on strings as plain text", () => {
      expect(parseIntent("studio~=MAPPA").cleanQuery).toBe("studio~=MAPPA");
    });

    it("desugars from...to ranges with open and swapped ends", () => {
      expect(parseIntent("year=2015...2020").yearOps).toEqual([
        { op: ">=", value: 2015 },
        { op: "<=", value: 2020 },
      ]);
      expect(parseIntent("year=2015...").yearOps).toEqual([{ op: ">=", value: 2015 }]);
      expect(parseIntent("year=...2020").yearOps).toEqual([{ op: "<=", value: 2020 }]);
      expect(parseIntent("year=2020...2015").yearOps).toEqual([
        { op: ">=", value: 2015 },
        { op: "<=", value: 2020 },
      ]);
    });

    it("desugars date ranges", () => {
      expect(parseIntent('date="01.01.2020...31.12.2020"').dateConds).toEqual([
        { op: ">=", iso: "2020-01-01", yearOnly: false },
        { op: "<=", iso: "2020-12-31", yearOnly: false },
      ]);
    });

    it("keeps broken ranges in the text query", () => {
      expect(parseIntent("year=abc...2020").cleanQuery).toBe("year=abc...2020");
      expect(parseIntent("year=...").cleanQuery).toBe("year=...");
    });
  });

  describe("parseIntent tag alias", () => {
    it("treats tag as genre", () => {
      expect(parseIntent('tag="sci fi"').genre).toBe("sci fi");
    });

    it("merges tag with genre as an OR group", () => {
      expect(parseIntent("genre=action tag=comedy").genre).toBe("action|comedy");
    });

    it("maps tag negations to genre", () => {
      expect(parseIntent("tag!=comedy").negations).toEqual([{ key: "genre", value: "comedy" }]);
    });
  });

  describe("isTagLikeQuery", () => {
    it("treats equals queries and key prefixes as tag-like", () => {
      expect(isTagLikeQuery("year=2", "year 2")).toBe(true);
      expect(isTagLikeQuery("ye", "ye")).toBe(true);
      expect(isTagLikeQuery("status", "status")).toBe(true);
    });

    it("treats plain title text and single letters as not tag-like", () => {
      expect(isTagLikeQuery("nar", "nar")).toBe(false);
      expect(isTagLikeQuery("s", "s")).toBe(false);
    });

    it("leaves removed dead keys as plain text", () => {
      expect(tokenizeIntent("season:2 quality:1080p language:ru")).toEqual([]);
      expect(parseIntent("season:2").cleanQuery).toBe("season:2");
    });
  });
});

describe("search/mascot", () => {
  const MASCOT = { left: 0, top: 400, right: 216, bottom: 616 };
  const SQUARE = { left: 0, top: 0, right: 100, bottom: 100 };

  describe("overlapCoverage", () => {
    it("measures the covered fraction of the mascot", () => {
      expect(overlapCoverage(SQUARE, { left: 50, top: 50, right: 300, bottom: 300 })).toBe(0.25);
    });

    it("counts a partial overlap", () => {
      expect(overlapCoverage(MASCOT, { left: 142, top: 300, right: 718, bottom: 460 })).toBeCloseTo(
        0.095,
        3
      );
    });

    it("counts containment as full coverage", () => {
      expect(overlapCoverage(MASCOT, { left: -50, top: 300, right: 500, bottom: 800 })).toBe(1);
    });

    it("ignores separated and edge-touching rects", () => {
      expect(overlapCoverage(MASCOT, { left: 900, top: 300, right: 1476, bottom: 460 })).toBe(0);
      expect(overlapCoverage(MASCOT, { left: 216, top: 400, right: 500, bottom: 616 })).toBe(0);
    });

    it("ignores zero-area rects", () => {
      expect(overlapCoverage({ left: 0, top: 0, right: 0, bottom: 0 }, SQUARE)).toBe(0);
    });
  });

  describe("shouldDimMascot", () => {
    it("dims once the panel covers a meaningful part of the mascot", () => {
      const panel = { left: 66, top: 466, right: 600, bottom: 800 };
      expect(overlapCoverage(MASCOT, panel)).toBeGreaterThan(MASCOT_DIM_COVERAGE);
      expect(shouldDimMascot(MASCOT, panel)).toBe(true);
    });

    it("ignores a panel that covers less than a fifth of the mascot", () => {
      const panel = { left: 0, top: 576, right: 600, bottom: 800 };
      expect(overlapCoverage(MASCOT, panel)).toBeGreaterThan(0.1);
      expect(shouldDimMascot(MASCOT, panel)).toBe(false);
    });

    it("ignores a panel that only grazes the mascot", () => {
      expect(shouldDimMascot(MASCOT, { left: 200, top: 556, right: 776, bottom: 800 })).toBe(false);
    });

    it("ignores a panel that is fully clear of the mascot", () => {
      expect(shouldDimMascot(MASCOT, { left: 900, top: 300, right: 1476, bottom: 460 })).toBe(
        false
      );
    });

    it("dims exactly at the threshold", () => {
      expect(overlapCoverage(SQUARE, { left: 0, top: 80, right: 300, bottom: 300 })).toBe(
        MASCOT_DIM_COVERAGE
      );
      expect(shouldDimMascot(SQUARE, { left: 0, top: 80, right: 300, bottom: 300 })).toBe(true);
    });
  });
});

describe("search/quality", () => {
  const INDEX: SearchAnimeSuggestion[] = [
    {
      aliases: ["Sousou no Frieren"],
      favourite: true,
      id: 1,
      score: 95,
      status: "COMPLETED",
      title: "Frieren: Beyond Journey's End",
    },
    {
      aliases: [],
      favourite: false,
      id: 2,
      score: 0,
      status: "PLANNING",
      title: "Fruits Basket",
    },
    {
      aliases: ["Shingeki no Kyojin"],
      favourite: false,
      id: 3,
      score: 87,
      status: "FINISHED",
      title: "Attack on Titan",
    },
  ];

  function top(query: string, extra: Record<string, unknown> = {}): string | undefined {
    return getSearchSuggestions(query, { animeIndex: INDEX, limit: 5, ...extra })[0]?.value;
  }

  describe("search quality oracle", () => {
    it("never echoes the exact query (scorer contract)", () => {
      expect(top("frieren: beyond journey's end")).toBeUndefined();
      expect(top("attack on titan")).toBeUndefined();
    });

    it("resolves prefixes to the best title", () => {
      expect(top("frie")).toBe("Frieren: Beyond Journey's End");
      expect(top("attack")).toBe("Attack on Titan");
    });

    it("resolves aliases", () => {
      expect(top("sousou no frieren")).toBe("Frieren: Beyond Journey's End");
      expect(top("shingeki")).toBe("Attack on Titan");
    });

    it("resolves typos through the spelling fallback", () => {
      expect(top("friren")).toBe("Frieren: Beyond Journey's End");
    });

    it("prefers history matches learned by selection", () => {
      const value = getSearchSuggestions("frieren 108", {
        animeIndex: INDEX,
        history: ["frieren 1080p"],
        limit: 5,
      })[0]?.value;
      expect(value).toBe("frieren 1080p");
    });

    it("keeps collection titles above plain history", () => {
      const value = getSearchSuggestions("nar", {
        animeIndex: [],
        collectionItems: [{ title: "Naruto", altTitles: [] }],
        history: ["naruto shippuden filler"],
        limit: 5,
      })[0]?.value;
      expect(value).toBe("Naruto");
    });

    it("returns nothing for empty queries and honors the limit", () => {
      expect(getSearchSuggestions("   ", { animeIndex: INDEX })).toEqual([]);
      expect(getSearchSuggestions("f", { animeIndex: INDEX, limit: 1 }).length).toBeLessThanOrEqual(
        1
      );
    });
  });
});

describe("search/ranking", () => {
  describe("ml phase1 - normalize parity", () => {
    it("strips diacritics like Rust NFKD", () => {
      expect(normalizeSearchText("  Frieren   S02  ")).toBe("frieren s02");
      expect(normalizeSearchText("ЖЁсткий  Тест")).toBe("жесткии тест");
      expect(normalizeSearchText("café")).toBe("cafe");
      expect(normalizeSearchText("Friéren_S02")).toBe("frieren s02");
    });

    it("fuzzyScore still prefers exact > prefix", () => {
      expect(fuzzyMatchScore("frieren", "Frieren")).toBeGreaterThan(
        fuzzyMatchScore("friren", "Frieren")!
      );
    });
  });

  describe("ml phase1 - recency exp", () => {
    it("recency decays exponentially not linear", () => {
      expect(recencyBoost(0)).toBe(60);
      expect(recencyBoost(24)).toBeCloseTo(30, 0);
      expect(recencyBoost(48)).toBeCloseTo(15, 0);
      expect(recencyBoost(60)).toBeGreaterThan(5);
      expect(recencyBoost(60)).toBeLessThan(15);
    });
  });

  describe("ml phase1 - TTL", () => {
    it("purges stats older than 90 days", async () => {
      const { useSearchStore } = await import("@/store/search.store");
      const now = Date.now();
      const old = now - 91 * 24 * 60 * 60 * 1000;
      const queryStats: Record<string, SearchQueryStat> = {
        fresh: { count: 1, lastUsedAt: now, selectedCount: 0 },
        stale: { count: 5, lastUsedAt: old, selectedCount: 0 },
      };
      const suggestionStats: Record<string, SearchQueryStat> = {
        stale2: { count: 1, lastUsedAt: old, selectedCount: 0 },
      };
      useSearchStore.setState({ queryStats, suggestionStats });
      useSearchStore.getState().purgeExpired();
      const s = useSearchStore.getState();
      expect(s.queryStats["fresh"]).toBeDefined();
      expect(s.queryStats["stale"]).toBeUndefined();
      expect(s.suggestionStats["stale2"]).toBeUndefined();
    });

    it("getSearchSuggestions with Cyrillic ё still matches", () => {
      const idx: SearchAnimeSuggestion[] = [
        {
          id: 1,
          title: "Жёсткий тест",
          aliases: [],
          status: "COMPLETED",
          score: 0,
          favourite: false,
        },
      ];
      const sug = getSearchSuggestions("жесткий", { animeIndex: idx });
      expect(sug.length).toBeGreaterThan(0);
      expect(sug[0].value).toBe("Жёсткий тест");
    });
  });
});

describe("search/results", () => {
  const sortItems: Anime[] = [
    {
      category: "",
      leechers: 5,
      link: "",
      magnet: "",
      seeders: 10,
      size: "100 MiB",
      title: "A",
      torrent: "",
    },
    {
      category: "",
      leechers: 3,
      link: "",
      magnet: "",
      seeders: 20,
      size: "200 MiB",
      title: "B",
      torrent: "",
    },
    {
      category: "",
      leechers: 10,
      link: "",
      magnet: "",
      seeders: 5,
      size: "50 MiB",
      title: "C",
      torrent: "",
    },
  ];

  const filterItems: Anime[] = [
    {
      category: "",
      leechers: 5,
      link: "",
      magnet: "magnet:?xt=1",
      seeders: 10,
      size: "1 GiB",
      title: "[Group] Show [1080p][HEVC][MultiSub][RUS]",
      torrent: "",
    },
    {
      category: "",
      leechers: 3,
      link: "",
      magnet: "",
      seeders: 8,
      size: "500 MiB",
      title: "[Group] Show [720p][x264][ENG]",
      torrent: "",
    },
    {
      category: "",
      leechers: 2,
      link: "",
      magnet: "magnet:?xt=2",
      seeders: 5,
      size: "200 MiB",
      title: "[Group] Show [480p][HEVC]",
      torrent: "",
    },
    {
      category: "",
      leechers: 1,
      link: "",
      magnet: "",
      seeders: 2,
      size: "800 MiB",
      title: "[Different] Show [1080p][x264][Dual-Audio]",
      torrent: "",
    },
  ];

  const defaultFilters: SearchFilters = {
    codec: "all",
    hasMagnet: false,
    language: "all",
    minSeeders: 0,
    quality: "all",
    sizeMax: 0,
    sizeMin: 0,
  };

  const filters = (overrides: Partial<SearchFilters>): SearchFilters => ({
    ...defaultFilters,
    ...overrides,
  });

  describe("sortAnimeResults", () => {
    it.each([
      { key: "seeders", dir: "desc", first: "B", last: "C" },
      { key: "seeders", dir: "asc", first: "C", last: "B" },
      { key: "leechers", dir: "desc", first: "C", last: "B" },
      { key: "leechers", dir: "asc", first: "B", last: "C" },
      { key: "size", dir: "desc", first: "B", last: "C" },
      { key: "size", dir: "asc", first: "C", last: "B" },
    ] as const)("sorts by $key $dir", ({ key, dir, first, last }) => {
      const sorted = sortAnimeResults(sortItems, key, dir)!;
      expect(sorted[0].title).toBe(first);
      expect(sorted[2].title).toBe(last);
    });

    it("returns undefined for undefined input", () => {
      expect(sortAnimeResults(undefined, "seeders", "desc")).toBeUndefined();
    });
  });

  describe("filterAnimeResults", () => {
    it("passes all with default filters", () => {
      expect(filterAnimeResults(filterItems, defaultFilters)).toHaveLength(4);
    });

    it("filters by minSeeders", () => {
      const result = filterAnimeResults(filterItems, filters({ minSeeders: 8 }))!;
      expect(result).toHaveLength(2);
      expect(result[0].title).toContain("1080p");
      expect(result[1].title).toContain("720p");
    });

    it("filters by hasMagnet", () => {
      const result = filterAnimeResults(filterItems, filters({ hasMagnet: true }))!;
      expect(result).toHaveLength(2);
      expect(result.every((i) => i.magnet.startsWith("magnet:"))).toBe(true);
    });

    it("filters by quality 1080p", () => {
      const result = filterAnimeResults(filterItems, filters({ quality: "1080p" }))!;
      expect(result).toHaveLength(2);
      expect(result.every((i) => i.title.includes("1080p"))).toBe(true);
    });

    it("filters by language ru", () => {
      const result = filterAnimeResults(filterItems, filters({ language: "ru" }))!;
      expect(result).toHaveLength(1);
      expect(result[0].title).toContain("RUS");
    });

    it("filters by language dual audio", () => {
      const result = filterAnimeResults(filterItems, filters({ language: "dual" }))!;
      expect(result).toHaveLength(1);
      expect(result[0].title).toContain("Dual-Audio");
    });

    it("filters by size min 600 MiB", () => {
      const result = filterAnimeResults(filterItems, filters({ sizeMin: 600 }))!;
      expect(result).toHaveLength(2);
      expect(result[0].title).toContain("1080p");
      expect(result[1].title).toContain("1080p");
    });

    it("filters by size max 300 MiB", () => {
      const result = filterAnimeResults(filterItems, filters({ sizeMax: 300 }))!;
      expect(result).toHaveLength(1);
      expect(result[0].title).toContain("480p");
    });

    it("filters by size range 300-900 MiB", () => {
      expect(filterAnimeResults(filterItems, filters({ sizeMin: 300, sizeMax: 900 }))).toHaveLength(
        2
      );
    });

    it("filters by codec HEVC", () => {
      const result = filterAnimeResults(filterItems, filters({ codec: "HEVC" }))!;
      expect(result).toHaveLength(2);
      expect(result.every((i) => i.title.includes("HEVC"))).toBe(true);
    });

    it("filters by codec x264", () => {
      expect(filterAnimeResults(filterItems, filters({ codec: "x264" }))!).toHaveLength(2);
    });

    it("combines multiple filters", () => {
      const result = filterAnimeResults(
        filterItems,
        filters({ hasMagnet: true, minSeeders: 3, quality: "1080p" })
      )!;
      expect(result).toHaveLength(1);
      expect(result[0].title).toContain("[Group] Show [1080p]");
    });

    it("returns undefined for undefined input", () => {
      expect(filterAnimeResults(undefined, defaultFilters)).toBeUndefined();
    });
  });
});

describe("search/rutracker", () => {
  const identity = (key: string) => key;

  describe("mapError", () => {
    it("maps the blocked code to the anti-bot hint", () => {
      expect(mapError("blocked: anti-bot challenge on rutracker", identity)).toBe(
        "search.rutracker.err.blocked"
      );
    });

    it("maps the wrong-credentials code without the detail", () => {
      expect(mapError("wrong_credentials", identity)).toBe(
        "search.rutracker.err.wrong.credentials"
      );
    });

    it("appends the detail to the network label", () => {
      expect(mapError("network: Connection failed: timeout", identity)).toBe(
        "search.rutracker.err.network\nConnection failed: timeout"
      );
    });

    it("falls back to the unknown label for new codes", () => {
      expect(mapError("something_new: detail", identity)).toBe("search.rutracker.err.unknown");
    });
  });
});

describe("search/score", () => {
  const FRIEREN = "Frieren: Beyond Journey's End";

  describe("operator query parsing", () => {
    it("returns null for plain queries", () => {
      expect(parseOperatorTerms("frieren")).toBeNull();
      expect(parseOperatorTerms("attack on titan")).toBeNull();
    });

    it("parses prefix, suffix, exact and negation markers", () => {
      expect(parseOperatorTerms("^frie")).toEqual([
        { negate: false, mode: "prefix", text: "frie" },
      ]);
      expect(parseOperatorTerms("titan$")).toEqual([
        { negate: false, mode: "suffix", text: "titan" },
      ]);
      expect(parseOperatorTerms("'frier")).toEqual([
        { negate: false, mode: "exact", text: "frier" },
      ]);
      expect(parseOperatorTerms("!basket")).toEqual([
        { negate: true, mode: "fuzzy", text: "basket" },
      ]);
      expect(parseOperatorTerms("!^end")).toEqual([{ negate: true, mode: "prefix", text: "end" }]);
    });

    it("falls back to legacy matching on malformed markers", () => {
      expect(parseOperatorTerms("^")).toBeNull();
      expect(parseOperatorTerms("!")).toBeNull();
      expect(parseOperatorTerms("a$b")).toBeNull();
      expect(parseOperatorTerms("'foo$")).toBeNull();
    });
  });

  describe("operator query matching", () => {
    it("anchors prefixes and suffixes", () => {
      expect(fuzzyMatchScore("^frie", FRIEREN)).not.toBeNull();
      expect(fuzzyMatchScore("^beyond", FRIEREN)).toBeNull();
      expect(fuzzyMatchScore("end$", FRIEREN)).not.toBeNull();
      expect(fuzzyMatchScore("^journey$", FRIEREN)).toBeNull();
      expect(fuzzyMatchScore("^abc$", "abc")).toBe(350 + 1000);
    });

    it("matches exact substrings without fuzziness", () => {
      expect(fuzzyMatchScore("'frier", FRIEREN)).not.toBeNull();
      expect(fuzzyMatchScore("'friren", FRIEREN)).toBeNull();
    });

    it("drops candidates on negated terms", () => {
      expect(fuzzyMatchScore("frieren !basket", FRIEREN)).not.toBeNull();
      expect(fuzzyMatchScore("frieren !journey", FRIEREN)).toBeNull();
      expect(matchOperatorTerms(parseOperatorTerms("!zzz") ?? [], "frieren")).toBe(350);
    });

    it("requires every positive term", () => {
      expect(fuzzyMatchScore("^attack titan", "Attack on Titan")).not.toBeNull();
      expect(fuzzyMatchScore("^attack basket", "Attack on Titan")).toBeNull();
    });
  });

  describe("operator queries in suggestions", () => {
    const animeIndex = [
      {
        aliases: [],
        favourite: false,
        id: 1,
        score: 0,
        status: "COMPLETED",
        title: "Frieren: Beyond Journey's End",
      },
      {
        aliases: [],
        favourite: false,
        id: 2,
        score: 0,
        status: "PLANNING",
        title: "Fruits Basket",
      },
    ];

    it("ranks anchored matches first", () => {
      const top = getSearchSuggestions("^fri", { animeIndex, limit: 5 })[0]?.value;
      expect(top).toBe("Frieren: Beyond Journey's End");
    });

    it("excludes negated titles", () => {
      const values = getSearchSuggestions("!basket fr", { animeIndex, limit: 5 }).map(
        (item) => item.value
      );
      expect(values).toContain("Frieren: Beyond Journey's End");
      expect(values).not.toContain("Fruits Basket");
    });

    it("shows operator examples only once a marker is typed", () => {
      const extras = [
        { value: "^title", subtitle: "starts with", operator: true },
        { value: "titanic" },
      ];
      const plain = getSearchSuggestions("tit", { extraValues: extras, limit: 8 }).map(
        (item) => item.value
      );
      expect(plain).toContain("titanic");
      expect(plain).not.toContain("^title");
      const marked = getSearchSuggestions("^tit", { extraValues: extras, limit: 8 }).map(
        (item) => item.value
      );
      expect(marked).toContain("^title");
    });
  });
});

describe("search/suggestions", () => {
  const animeIndex: SearchAnimeSuggestion[] = [
    {
      aliases: ["Sousou no Frieren"],
      favourite: true,
      id: 1,
      score: 95,
      status: "COMPLETED",
      title: "Frieren: Beyond Journey's End",
    },
    {
      aliases: [],
      favourite: false,
      id: 2,
      score: 0,
      status: "PLANNING",
      title: "Fruits Basket",
    },
  ];

  describe("search suggestions", () => {
    it("normalizes punctuation and diacritics", () => {
      expect(normalizeSearchText("  Friéren_S02  ")).toBe("frieren s02");
    });

    it("prefers exact and prefix matches over fuzzy matches", () => {
      expect(fuzzyMatchScore("frieren", "Frieren")).toBeGreaterThan(
        fuzzyMatchScore("frier", "Frieren")!
      );
      expect(fuzzyMatchScore("friren", "Frieren")).not.toBeNull();
    });

    it("uses AniList favourites and status as a secondary ranking signal", () => {
      const suggestions = getSearchSuggestions("fr", {
        animeIndex,
        limit: 5,
      });
      expect(suggestions[0]?.value).toBe("Frieren: Beyond Journey's End");
      expect(suggestions[0]?.kind).toBe("anime");
    });

    it("hides backend anime suggestions when AniList is not authenticated", () => {
      const backendSuggestions = [
        {
          kind: "anime" as const,
          score: 900,
          value: "Frieren: Beyond Journey's End",
        },
        {
          kind: "history" as const,
          score: 700,
          value: "frieren 1080p",
        },
      ];
      const hidden = getSearchSuggestions("fri", {
        animeEnabled: false,
        backendSuggestions,
        limit: 5,
      });
      expect(hidden.map((item) => item.kind)).not.toContain("anime");
      expect(hidden).toContainEqual(expect.objectContaining({ value: "frieren 1080p" }));

      const shown = getSearchSuggestions("fri", {
        animeEnabled: true,
        backendSuggestions,
        limit: 5,
      });
      expect(shown.map((item) => item.kind)).toContain("anime");
    });

    it("learns from repeated and selected history without duplicating values", () => {
      const suggestions = getSearchSuggestions("fri", {
        animeIndex: [],
        history: ["frieren 1080p", "frieren bd"],
        queryStats: {
          "frieren 1080p": {
            count: 10,
            lastUsedAt: Date.now(),
            selectedCount: 2,
          },
        },
        suggestionStats: {},
        limit: 5,
      });
      expect(suggestions[0]?.value).toBe("frieren 1080p");
      expect(new Set(suggestions.map((item) => item.value)).size).toBe(suggestions.length);
    });

    it("penalizes ignored suggestions and supports scope filtering", () => {
      const suggestions = getSearchSuggestions("fri", {
        animeIndex,
        scope: "player",
        suggestionStats: {
          "frieren: beyond journey's end": {
            count: 0,
            ignoredCount: 3,
            lastUsedAt: Date.now(),
            selectedCount: 0,
          },
        },
      });
      expect(suggestions).toEqual([]);
    });

    it("returns only prefix completions for ghost text", () => {
      const suggestions = getSearchSuggestions("fr", { animeIndex });
      expect(getInlineCompletion("fr", suggestions)).toBe("Frieren: Beyond Journey's End");
      expect(getInlineCompletion("x", suggestions)).toBeNull();
    });

    it("matches multi-word queries against distinct words", () => {
      const match = fuzzyMatchScore("frieren journey", "Frieren: Beyond Journey's End");
      expect(match).not.toBeNull();
      expect(fuzzyMatchScore("frieren journey", "Fruits Basket")).toBeNull();
      expect(match!).toBeGreaterThan(500);
    });

    it("prefers matches at word boundaries over mid-word substrings", () => {
      const atBoundary = fuzzyMatchScore("att", "Attack on Titan");
      const midWord = fuzzyMatchScore("att", "Somewhere in Battle Tactics");
      expect(atBoundary).not.toBeNull();
      expect(atBoundary!).toBeGreaterThan(midWord!);
    });

    it("rejects multi-word queries missing a word", () => {
      expect(fuzzyMatchScore("frieren zzz", "Frieren: Beyond Journey's End")).toBeNull();
    });

    it("returns identical typo corrections on repeated calls with shared options", () => {
      const options = { animeIndex, history: ["Naruto Shippuden"] };
      const first = getSearchSuggestions("naruto shipuden", options);
      const second = getSearchSuggestions("naruto shipuden", options);
      expect(second).toEqual(first);
      expect(first.some((s) => s.value === "Naruto Shippuden")).toBe(true);
    });

    it("rebuilds typo correction when history changes under a shared anime index", () => {
      const stale = getSearchSuggestions("naruto shipuden", {
        animeIndex,
        history: ["Alpha Beta"],
      });
      expect(stale.some((s) => s.value === "Naruto Shippuden")).toBe(false);
      const fresh = getSearchSuggestions("naruto shipuden", {
        animeIndex,
        history: ["Naruto Shippuden"],
      });
      expect(fresh.some((s) => s.value === "Naruto Shippuden")).toBe(true);
    });

    it("resolves the rank-bench calibration rows", () => {
      const index: SearchAnimeSuggestion[] = [
        {
          aliases: [],
          favourite: false,
          id: 1,
          score: null,
          status: "PLANNING",
          title: "Steins;Gate",
        },
        {
          aliases: [],
          favourite: false,
          id: 2,
          score: null,
          status: "PLANNING",
          title: "Tonari no Totoro",
        },
        {
          aliases: [],
          favourite: false,
          id: 3,
          score: null,
          status: "PLANNING",
          title: "Shingeki no Kyojin OVA",
        },
      ];
      const options = { animeIndex: index, history: ["мстители"] };
      expect(getSearchSuggestions("stains gate", options)[0]?.value).toBe("Steins;Gate");
      expect(getSearchSuggestions("totoro tonari", options)[0]?.value).toBe("Tonari no Totoro");
      expect(getSearchSuggestions("SHINGEKI NO KYOJIN", options)[0]?.value).toBe(
        "Shingeki no Kyojin OVA"
      );
      expect(getSearchSuggestions("мстител", options)[0]?.value).toBe("мстители");
    });

    it("ranks tag hints above collection titles for tag-like queries", () => {
      const suggestions = getSearchSuggestions("yea", {
        scope: "filter",
        collectionItems: [{ title: "Year One" }],
        extraValues: [{ value: "year=2020" }],
      });
      expect(suggestions[0]?.value).toBe("year=2020");
    });

    it("keeps collection titles above tag hints for plain text", () => {
      const suggestions = getSearchSuggestions("ar", {
        scope: "filter",
        collectionItems: [{ title: "Naruto" }],
        extraValues: [{ value: "year=2020" }],
      });
      expect(suggestions[0]?.value).toBe("Naruto");
    });
  });

  describe("suggestSpelling", () => {
    beforeEach(() => {
      useSettingsStore.setState({ searchSymSpellEnabled: true });
    });

    it("corrects a typo from anime titles", () => {
      expect(suggestSpelling("friren", { animeIndex })).toBe("frieren");
    });

    it("stays silent on exact matches", () => {
      expect(suggestSpelling("frieren", { animeIndex })).toBeNull();
    });

    it("stays silent on short queries and empty titles", () => {
      expect(suggestSpelling("fr", { animeIndex })).toBeNull();
      expect(suggestSpelling("friren", {})).toBeNull();
    });

    it("stays silent when symspell is disabled", () => {
      useSettingsStore.setState({ searchSymSpellEnabled: false });
      expect(suggestSpelling("friren", { animeIndex })).toBeNull();
    });
  });
});

describe("search/wallpaper", () => {
  describe("buildWallpaperFilter", () => {
    it("renders the stored dim by default", () => {
      expect(buildWallpaperFilter()).toBe("brightness(75%)");
    });

    it("returns none when every knob is neutral", () => {
      expect(
        buildWallpaperFilter({
          brightness: 100,
          contrast: 100,
          saturate: 100,
          blur: 0,
          opacity: 100,
        })
      ).toBe("none");
    });

    it("composes only non-neutral knobs", () => {
      expect(buildWallpaperFilter({ contrast: 110, blur: 6 })).toBe(
        "brightness(75%) contrast(110%) blur(6px)"
      );
    });
  });

  describe("buildShadow", () => {
    const off = { top: false, right: false, bottom: false, left: false };
    const shadow = { sides: off, intensity: 50, color: "#000000" };

    it("is absent without enabled sides and zero intensity", () => {
      expect(buildShadow()).toBeUndefined();
      expect(buildShadow(shadow)).toBeUndefined();
      expect(buildShadow({ sides: { ...off, top: true }, intensity: 0 })).toBeUndefined();
    });

    it("paints one layer per enabled side", () => {
      expect(buildShadow({ ...shadow, sides: { ...off, top: true } })).toBe(
        "0 -8px 40px rgba(0,0,0,0.5)"
      );
      expect(
        buildShadow({ ...shadow, sides: { top: true, right: true, bottom: true, left: true } })
      ).toBe(
        "0 -8px 40px rgba(0,0,0,0.5), 8px 0 40px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.5), -8px 0 40px rgba(0,0,0,0.5)"
      );
    });

    it("derives offset from length and blur from softness", () => {
      expect(
        buildShadow({ ...shadow, sides: { ...off, bottom: true }, length: 15, softness: 5 })
      ).toBe("0 15px 5px rgba(0,0,0,0.5)");
    });

    it("scales alpha with intensity and falls back to black", () => {
      expect(buildShadow({ sides: { ...off, left: true }, intensity: 100, color: "nope" })).toBe(
        "-8px 0 40px rgba(0,0,0,1)"
      );
    });
  });

  describe("buildShadowGradients", () => {
    const off = { top: false, right: false, bottom: false, left: false };
    const shadow = { sides: off, intensity: 50, color: "#000000" };

    it("is absent without sides, zero intensity, or zero geometry", () => {
      expect(buildShadowGradients()).toBeUndefined();
      expect(buildShadowGradients(shadow)).toBeUndefined();
      expect(buildShadowGradients({ sides: { ...off, top: true }, intensity: 0 })).toBeUndefined();
      expect(
        buildShadowGradients({ sides: { ...off, top: true }, length: 0, softness: 0 })
      ).toBeUndefined();
    });

    it("paints one band per enabled side", () => {
      expect(buildShadowGradients({ ...shadow, sides: { ...off, top: true } })).toBe(
        "linear-gradient(to bottom, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px)"
      );
      expect(
        buildShadowGradients({
          ...shadow,
          sides: { top: true, right: true, bottom: true, left: true },
        })
      ).toBe(
        "linear-gradient(to bottom, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px), " +
          "linear-gradient(to left, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px), " +
          "linear-gradient(to top, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px), " +
          "linear-gradient(to right, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px)"
      );
    });

    it("follows length, softness, intensity, and color", () => {
      expect(
        buildShadowGradients({
          sides: { ...off, top: true },
          length: 20,
          softness: 30,
          intensity: 100,
          color: "#112233",
        })
      ).toBe(
        "linear-gradient(to bottom, rgba(17,34,51,1) 0px, rgba(17,34,51,1) 20px, transparent 50px)"
      );
    });
  });
});
