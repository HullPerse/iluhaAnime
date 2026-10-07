import { describe, expect, it } from "vitest";

import { stripMediaExtension, tokenizeMediaName } from "@/lib/media/tokenize.utils";

const EXT_ORACLE: [string, string, string | null][] = [
  ["Horimiya - 01.mkv", "Horimiya - 01", "mkv"],
  ["Dandadan - 01 [WEB-DL].CR.full.eng.ass", "Dandadan - 01 [WEB-DL].CR.full.eng", "ass"],
  [
    "Valgalla.Saga.2009.RUS.BDRip.XviD.AC3.-HQCLUB.avi",
    "Valgalla.Saga.2009.RUS.BDRip.XviD.AC3.-HQCLUB",
    "avi",
  ],
  ["Luo Xiao Hei Zhanji [BDRip].mp4", "Luo Xiao Hei Zhanji [BDRip]", "mp4"],
  ["Tochno Ne Ampir V", "Tochno Ne Ampir V", null],
  ["archive.tar.gz", "archive.tar.gz", null],
];

describe("stripMediaExtension", () => {
  it.each(EXT_ORACLE)("strips %s into stem and ext", (filename, stem, ext) => {
    expect(stripMediaExtension(filename)).toEqual({ stem, ext });
  });
});

describe("tokenizeMediaName", () => {
  it("splits dots, spaces, and dashes into plain tokens", () => {
    expect(tokenizeMediaName("Blue.Eye.Samurai.S01E01.WEB-DL.1080p.RGzsRutracker")).toEqual([
      { value: "Blue", enclosed: "plain" },
      { value: "Eye", enclosed: "plain" },
      { value: "Samurai", enclosed: "plain" },
      { value: "S01E01", enclosed: "plain" },
      { value: "WEB", enclosed: "plain" },
      { value: "DL", enclosed: "plain" },
      { value: "1080p", enclosed: "plain" },
      { value: "RGzsRutracker", enclosed: "plain" },
    ]);
  });

  it("extracts bracket and paren groups whole", () => {
    expect(
      tokenizeMediaName("[Zagzad] Yoru no Kurage wa Oyogenai - 05 (BDRip 1920x1080 HEVC-10bit THD)")
    ).toEqual([
      { value: "Zagzad", enclosed: "bracket" },
      { value: "Yoru", enclosed: "plain" },
      { value: "no", enclosed: "plain" },
      { value: "Kurage", enclosed: "plain" },
      { value: "wa", enclosed: "plain" },
      { value: "Oyogenai", enclosed: "plain" },
      { value: "05", enclosed: "plain" },
      { value: "BDRip 1920x1080 HEVC-10bit THD", enclosed: "paren" },
    ]);
  });

  it("normalizes the en-dash into a split point", () => {
    expect(tokenizeMediaName("Yoru no Kurage wa Oyogenai – 05").map((t) => t.value)).toEqual([
      "Yoru",
      "no",
      "Kurage",
      "wa",
      "Oyogenai",
      "05",
    ]);
  });

  it("splits underscore groups and keeps each bracket", () => {
    expect(
      tokenizeMediaName("[AniDub]_Kaiba_TV_[06_of_12]_[ru_jp]_[1280x720_h264_aac]_[eNd]").map(
        (token) => `${token.enclosed}:${token.value}`
      )
    ).toEqual([
      "bracket:AniDub",
      "plain:Kaiba",
      "plain:TV",
      "bracket:06_of_12",
      "bracket:ru_jp",
      "bracket:1280x720_h264_aac",
      "bracket:eNd",
    ]);
  });

  it("keeps ten adjacent brackets as ten tokens", () => {
    const tokens = tokenizeMediaName(
      "[YMDR][Grandmaster of Demonic Cultivation][2018][01][1080p][HEVC][CHI][GB][AAC][ViPHD]"
    );
    expect(tokens).toHaveLength(10);
    expect(tokens[0]).toEqual({ value: "YMDR", enclosed: "bracket" });
    expect(tokens[1]).toEqual({
      value: "Grandmaster of Demonic Cultivation",
      enclosed: "bracket",
    });
  });

  it("keeps digit ranges and version dots whole", () => {
    expect(tokenizeMediaName("133-134. Женщина").map((token) => token.value)).toEqual([
      "133-134",
      "Женщина",
    ]);
    expect(tokenizeMediaName("39.Коварный").map((token) => token.value)).toEqual([
      "39",
      "Коварный",
    ]);
    expect(tokenizeMediaName("Look.Back.2024.1080p.AMZN.WEB-DL.DDP5.1.H.264")).toContainEqual({
      value: "DDP5",
      enclosed: "plain",
    });
  });

  it("preserves ampersand and apostrophe tokens", () => {
    const values = tokenizeMediaName("Adventure Time Fionna & Cake S01E09 Casper & Nova").map(
      (token) => token.value
    );
    expect(values).toContain("&");
    expect(values).toContain("S01E09");
    expect(tokenizeMediaName("Zatsu Tabi - That's Journey - 01").map((t) => t.value)).toContain(
      "That's"
    );
  });

  it("skips empty groups", () => {
    expect(tokenizeMediaName("A[]B").map((token) => token.value)).toEqual(["A", "B"]);
  });
});
