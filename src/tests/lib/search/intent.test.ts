import { describe, expect, it } from "vitest";

import { isTagLikeQuery, parseIntent, tokenizeIntent } from "@/lib/search/intent.utils";

describe("tokenizeIntent", () => {
  it("returns spans for known filter tokens", () => {
    expect(tokenizeIntent("studio:MAPPA frieren")).toEqual([
      { start: 0, end: 12, key: "studio", op: ":", value: "MAPPA" },
    ]);
  });

  it("keeps quoted values in one span", () => {
    const query = 'genre:"sci fi" frieren';
    const tokens = tokenizeIntent(query);
    expect(tokens).toHaveLength(1);
    expect(query.slice(tokens[0]!.start, tokens[0]!.end)).toBe('genre:"sci fi"');
  });
  it("ignores unknown keys and empty values", () => {
    expect(tokenizeIntent("foo:bar studio: year:2024")).toEqual([
      { start: 16, end: 25, key: "year", op: ":", value: "2024" },
    ]);
  });

  it("matches parseIntent filter keys", () => {
    const query = 'studio:MAPPA year:2024 genre:"sci fi" frieren';
    const keys = tokenizeIntent(query)
      .map((t) => t.key)
      .sort();
    expect(keys).toEqual(Object.keys(parseIntent(query).rawFilters).sort());
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
    const intent = parseIntent("year>2020 year<2025 genre:action");
    expect(intent.year).toBeUndefined();
    expect(intent.yearOps).toEqual([
      { op: ">", value: 2020 },
      { op: "<", value: 2025 },
    ]);
    expect(intent.genre).toBe("action");
  });

  it("collects string negations without touching exact filters", () => {
    const intent = parseIntent("status!=completed studio!=MAPPA year:2024");
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
    const exact = parseIntent("episodes:24");
    expect(exact.episodes).toBe(24);
    const range = parseIntent("episodes>12 episodes!=24");
    expect(range.episodesOps).toEqual([
      { op: ">", value: 12 },
      { op: "!=", value: 24 },
    ]);
  });

  it("parses sort field with optional direction", () => {
    expect(parseIntent("sort:rating")).toMatchObject({ sortBy: "rating", sortDir: "desc" });
    expect(parseIntent("sort:name:asc")).toMatchObject({ sortBy: "name", sortDir: "asc" });
    expect(parseIntent("sort:year").sortBy).toBeUndefined();
  });

  it("parses progress exact and comparisons", () => {
    const intent = parseIntent("progress:0 progress>5");
    expect(intent.progress).toBe(0);
    expect(intent.progressOps).toEqual([{ op: ">", value: 5 }]);
  });
});

describe("isTagLikeQuery", () => {
  it("treats colon queries and key prefixes as tag-like", () => {
    expect(isTagLikeQuery("year:2", "year 2")).toBe(true);
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
