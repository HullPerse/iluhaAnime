import { describe, expect, it } from "vitest";

import { parseIntent, tokenizeIntent } from "@/lib/intentParser.utils";

describe("tokenizeIntent", () => {
  it("returns spans for known filter tokens", () => {
    expect(tokenizeIntent("studio:MAPPA frieren")).toEqual([
      { start: 0, end: 12, key: "studio", value: "MAPPA" },
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
      { start: 16, end: 25, key: "year", value: "2024" },
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
