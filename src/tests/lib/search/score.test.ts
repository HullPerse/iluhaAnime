import { describe, expect, it } from "vitest";

import { matchOperatorTerms, parseOperatorTerms } from "@/lib/search/score.utils";
import { fuzzyMatchScore, getSearchSuggestions } from "@/lib/search/suggestions.utils";

const FRIEREN = "Frieren: Beyond Journey's End";

describe("operator query parsing", () => {
  it("returns null for plain queries", () => {
    expect(parseOperatorTerms("frieren")).toBeNull();
    expect(parseOperatorTerms("attack on titan")).toBeNull();
  });

  it("parses prefix, suffix, exact and negation markers", () => {
    expect(parseOperatorTerms("^frie")).toEqual([{ negate: false, mode: "prefix", text: "frie" }]);
    expect(parseOperatorTerms("titan$")).toEqual([
      { negate: false, mode: "suffix", text: "titan" },
    ]);
    expect(parseOperatorTerms("'frier")).toEqual([{ negate: false, mode: "exact", text: "frier" }]);
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
