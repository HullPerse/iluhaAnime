import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORE_FORMAT,
  formatScore,
  normalizeToTen,
  parseScoreFormat,
  scoreFormatMax,
  scoreFormatSuffix,
  scoreIconFor,
  scoreOptions,
  smileyForScore,
  validateScoreInput,
  formatMeanScore,
} from "@/lib/anilist/score.utils";

describe("anilist/score format", () => {
  it("parses known formats and falls back to POINT_10", () => {
    expect(parseScoreFormat("POINT_100")).toBe("POINT_100");
    expect(parseScoreFormat("POINT_10_DECIMAL")).toBe("POINT_10_DECIMAL");
    expect(parseScoreFormat("POINT_10")).toBe("POINT_10");
    expect(parseScoreFormat("POINT_5")).toBe("POINT_5");
    expect(parseScoreFormat("POINT_3")).toBe("POINT_3");
    expect(parseScoreFormat("point_100")).toBe("POINT_100");
    expect(parseScoreFormat("unknown")).toBe(DEFAULT_SCORE_FORMAT);
    expect(parseScoreFormat(null)).toBe(DEFAULT_SCORE_FORMAT);
    expect(parseScoreFormat(undefined)).toBe(DEFAULT_SCORE_FORMAT);
    expect(parseScoreFormat(10)).toBe(DEFAULT_SCORE_FORMAT);
  });

  it("reports max and suffix per format", () => {
    expect(scoreFormatMax("POINT_100")).toBe(100);
    expect(scoreFormatMax("POINT_10_DECIMAL")).toBe(10);
    expect(scoreFormatMax("POINT_10")).toBe(10);
    expect(scoreFormatMax("POINT_5")).toBe(5);
    expect(scoreFormatMax("POINT_3")).toBe(3);
    expect(scoreFormatSuffix("POINT_100")).toBe("/100");
    expect(scoreFormatSuffix("POINT_10_DECIMAL")).toBe("/10");
    expect(scoreFormatSuffix("POINT_10")).toBe("/10");
    expect(scoreFormatSuffix("POINT_5")).toBe("/5");
    expect(scoreFormatSuffix("POINT_3")).toBe("");
  });

  it("builds select options for discrete formats only", () => {
    expect(scoreOptions("POINT_10").map((o) => o.value)).toEqual([
      "",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(scoreOptions("POINT_5").map((o) => o.value)).toEqual(["", "1", "2", "3", "4", "5"]);
    expect(scoreOptions("POINT_3")).toEqual([
      { value: "", label: "-" },
      { value: "1", label: ":(" },
      { value: "2", label: ":|" },
      { value: "3", label: ":)" },
    ]);
    expect(scoreOptions("POINT_100")).toEqual([]);
    expect(scoreOptions("POINT_10_DECIMAL")).toEqual([]);
  });

  it("maps smiley scores and icons", () => {
    expect(smileyForScore(1)).toBe(":(");
    expect(smileyForScore(2)).toBe(":|");
    expect(smileyForScore(3)).toBe(":)");
    expect(smileyForScore(null)).toBeNull();
    expect(smileyForScore(0)).toBeNull();
    expect(smileyForScore(5)).toBeNull();
    expect(scoreIconFor("POINT_3", 1)).toBe("frown");
    expect(scoreIconFor("POINT_3", 2)).toBe("meh");
    expect(scoreIconFor("POINT_3", 3)).toBe("smile");
    expect(scoreIconFor("POINT_5", 4)).toBe("star");
    expect(scoreIconFor("POINT_10", 8)).toBe("star");
  });

  it("formats user scores with the owner denominator", () => {
    expect(formatScore(55, "POINT_100")).toBe("55/100");
    expect(formatScore(5.5, "POINT_10_DECIMAL")).toBe("5.5/10");
    expect(formatScore(8, "POINT_10")).toBe("8/10");
    expect(formatScore(4, "POINT_5")).toBe("4/5");
    expect(formatScore(3, "POINT_3")).toBe(":)");
    expect(formatScore(1, "POINT_3")).toBe(":(");
    expect(formatScore(null, "POINT_10")).toBe("-");
    expect(formatScore(0, "POINT_100")).toBe("-");
  });

  it("normalizes every format to the 1-10 collection scale", () => {
    expect(normalizeToTen(55, "POINT_100")).toBe(5.5);
    expect(normalizeToTen(85, "POINT_100")).toBe(8.5);
    expect(normalizeToTen(8.5, "POINT_10_DECIMAL")).toBe(8.5);
    expect(normalizeToTen(8, "POINT_10")).toBe(8);
    expect(normalizeToTen(4, "POINT_5")).toBe(8);
    expect(normalizeToTen(1, "POINT_3")).toBe(3);
    expect(normalizeToTen(2, "POINT_3")).toBe(7);
    expect(normalizeToTen(3, "POINT_3")).toBe(10);
    expect(normalizeToTen(null, "POINT_10")).toBeNull();
    expect(normalizeToTen(0, "POINT_100")).toBeNull();
  });

  it("accepts empty as cleared score", () => {
    expect(validateScoreInput("", "POINT_10")).toEqual({ value: null, error: null });
    expect(validateScoreInput("   ", "POINT_100")).toEqual({ value: null, error: null });
  });

  it.each([
    ["55", "POINT_100", 55],
    ["100", "POINT_100", 100],
    ["0", "POINT_100", 0],
    ["5.5", "POINT_10_DECIMAL", 5.5],
    ["8", "POINT_10_DECIMAL", 8],
    ["8", "POINT_10", 8],
    ["4", "POINT_5", 4],
    ["3", "POINT_3", 3],
  ])("accepts %s for %s", (raw, format, expected) => {
    expect(validateScoreInput(raw, format as "POINT_10").value).toBe(expected);
    expect(validateScoreInput(raw, format as "POINT_10").error).toBeNull();
  });

  it.each([
    ["abc", "POINT_10", "anilist.controls.score.need.number"],
    ["101", "POINT_100", "anilist.controls.score.need.int.100"],
    ["-1", "POINT_10", "anilist.controls.score.need.int.10"],
    ["5.5", "POINT_10", "anilist.controls.score.need.int.10"],
    ["5.5", "POINT_100", "anilist.controls.score.need.int.100"],
    ["8.55", "POINT_10_DECIMAL", "anilist.controls.score.need.decimal.10"],
    ["11", "POINT_10_DECIMAL", "anilist.controls.score.need.decimal.10"],
    ["6", "POINT_5", "anilist.controls.score.need.int.5"],
    ["2.5", "POINT_5", "anilist.controls.score.need.int.5"],
    ["4", "POINT_3", "anilist.controls.score.need.int.3"],
    ["1.5", "POINT_3", "anilist.controls.score.need.int.3"],
  ])("rejects %s for %s with a format specific message", (raw, format, expected) => {
    const result = validateScoreInput(raw, format as "POINT_10");
    expect(result.value).toBeNull();
    expect(result.error).toBe(expected);
  });

  it("formats the mean score in the user's own format", () => {
    expect(formatMeanScore(85, "POINT_100")).toBe("85/100");
    expect(formatMeanScore(8.53, "POINT_10")).toBe("8.5/10");
    expect(formatMeanScore(85, "POINT_10")).toBe("8.5/10");
    expect(formatMeanScore(40, "POINT_5")).toBe("2/5");
    expect(formatMeanScore(2.33, "POINT_3")).toBe("2.3/3");
    expect(formatMeanScore(null, "POINT_10")).toBeNull();
    expect(formatMeanScore(0, "POINT_10")).toBeNull();
  });
});
