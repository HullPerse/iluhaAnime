import { describe, expect, it } from "vitest";

import {
  findSubsequenceRanges,
  mergeRanges,
  normalizeText,
  splitByRanges,
} from "@/lib/highlight/highlight.utils";

describe("normalizeText", () => {
  it("lowercases ascii without normalization cost", () => {
    expect(normalizeText("Naruto Shippuden")).toBe("naruto shippuden");
  });

  it("strips accents and lowercases", () => {
    expect(normalizeText("Pokémon CAFÉ")).toBe("pokemon cafe");
  });

  it("keeps empty strings empty", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("findSubsequenceRanges", () => {
  it("returns no ranges for an empty query", () => {
    expect(findSubsequenceRanges("Naruto", "")).toEqual([]);
  });

  it("returns no ranges without a match", () => {
    expect(findSubsequenceRanges("Naruto", "xyz")).toEqual([]);
  });

  it("matches a subsequence across words", () => {
    expect(findSubsequenceRanges("Naruto", "nrt")).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
  });

  it("matches case-insensitively on ascii", () => {
    expect(findSubsequenceRanges("NARUTO", "nar")).toEqual([{ start: 0, end: 3 }]);
  });

  it("maps accented matches onto original indices", () => {
    expect(findSubsequenceRanges("Café Mocha", "cafe")).toEqual([{ start: 0, end: 4 }]);
  });

  it("matches the full value for an exact query", () => {
    expect(findSubsequenceRanges("One Piece", "one piece")).toEqual([{ start: 0, end: 9 }]);
  });
});

describe("mergeRanges", () => {
  it("sorts, clips, and drops empty ranges", () => {
    expect(
      mergeRanges(
        [
          { start: 8, end: 20 },
          { start: 2, end: 2 },
          { start: 5, end: 3 },
          { start: 0, end: 3 },
        ],
        10
      )
    ).toEqual([{ start: 0, end: 3 }, { start: 8, end: 10 }]);
  });

  it("merges adjacent ranges of the same kind", () => {
    expect(
      mergeRanges(
        [
          { start: 0, end: 2, kind: "match" },
          { start: 2, end: 5, kind: "match" },
        ],
        9
      )
    ).toEqual([{ start: 0, end: 5, kind: "match" }]);
  });

  it("splits overlaps by kind priority", () => {
    expect(
      mergeRanges(
        [
          { start: 0, end: 5, kind: "match" },
          { start: 3, end: 8, kind: "spell-error" },
        ],
        10
      )
    ).toEqual([
      { start: 0, end: 3, kind: "match" },
      { start: 3, end: 8, kind: "spell-error" },
    ]);
  });

  it("keeps a fully covered lower-priority range silent", () => {
    expect(
      mergeRanges(
        [
          { start: 0, end: 8, kind: "spell-error" },
          { start: 2, end: 5, kind: "match" },
        ],
        10
      )
    ).toEqual([{ start: 0, end: 8, kind: "spell-error" }]);
  });
});

describe("splitByRanges", () => {
  it("reconstructs the input exactly", () => {
    const value = "[Erai-raws] Naruto - 01 [1080p].mkv";
    const tokens = splitByRanges(value, findSubsequenceRanges(value, "nrt01"));
    expect(tokens.map((token) => token.text).join("")).toBe(value);
  });

  it("flags matched tokens", () => {
    expect(splitByRanges("Naruto", [{ start: 0, end: 3 }])).toEqual([
      { text: "Nar", highlighted: true, kind: undefined },
      { text: "uto", highlighted: false },
    ]);
  });

  it("returns one plain token without ranges", () => {
    expect(splitByRanges("Naruto", [])).toEqual([{ text: "Naruto", highlighted: false }]);
  });
});

describe("subsequence segmentation contract", () => {
  const corpus: Array<[string, string, Array<{ text: string; matched: boolean }>]> = [
    [
      "Naruto",
      "nrt",
      [
        { text: "N", matched: true },
        { text: "a", matched: false },
        { text: "r", matched: true },
        { text: "u", matched: false },
        { text: "t", matched: true },
        { text: "o", matched: false },
      ],
    ],
    ["One Piece", "", [{ text: "One Piece", matched: false }]],
    ["One Piece", "xyz", [{ text: "One Piece", matched: false }]],
    [
      "Sword Art Online",
      "sao",
      [
        { text: "S", matched: true },
        { text: "word ", matched: false },
        { text: "A", matched: true },
        { text: "rt ", matched: false },
        { text: "O", matched: true },
        { text: "nline", matched: false },
      ],
    ],
  ];

  it.each(corpus)("segments %s / %s", (value, query, expected) => {
    const actual = splitByRanges(value, findSubsequenceRanges(value, query)).map((token) => ({
      text: token.text,
      matched: token.highlighted,
    }));
    expect(actual).toEqual(expected);
  });
});
