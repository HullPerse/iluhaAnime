import { describe, expect, it } from "vitest";

import { classifyMediaTokens, classifyTokenValue } from "@/lib/media/classify.utils";
import { tokenizeMediaName } from "@/lib/media/tokenize.utils";

function kindsOf(name: string): [string, string][] {
  return classifyMediaTokens(tokenizeMediaName(name)).map((token) => [token.value, token.kind]);
}

const SINGLE_ORACLE: [string, "bracket" | "paren" | "plain", string][] = [
  ["SubsPlease", "bracket", "group"],
  ["RGzsRutracker", "plain", "group"],
  ["Jaskier", "plain", "group"],
  ["pk", "plain", "group"],
  ["CR", "plain", "service"],
  ["AMZN", "plain", "service"],
  ["BDRip", "plain", "source"],
  ["WEB", "plain", "source"],
  ["x265", "plain", "codec"],
  ["FLAC", "plain", "audio"],
  ["DDP5.1", "plain", "audio"],
  ["Rus", "plain", "lang"],
  ["jpn", "plain", "lang"],
  ["2xRus", "plain", "lang"],
  ["POR-BR", "bracket", "lang"],
  ["SPA-LA", "bracket", "lang"],
  ["DUB", "bracket", "dub"],
  ["ASS", "plain", "subs"],
  ["TV", "bracket", "type"],
  ["Movie", "plain", "type"],
  ["Gekijouban", "plain", "type"],
  ["NCOP01", "bracket", "special"],
  ["ED", "plain", "special"],
  ["S01E01", "plain", "seasonEpisode"],
  ["S2", "plain", "season"],
  ["2nd", "plain", "season"],
  ["Season", "plain", "season"],
  ["P1", "plain", "part"],
  ["Part", "plain", "part"],
  ["E01", "plain", "episode"],
  ["06_of_12", "bracket", "episode"],
  ["133-134", "plain", "episode"],
  ["1080p", "bracket", "resolution"],
  ["1920x808", "plain", "resolution"],
  ["1080i", "plain", "resolution"],
  ["10bits", "plain", "depth"],
  ["Ma10p", "plain", "depth"],
  ["2022", "paren", "year"],
  ["2013", "plain", "year"],
  ["292463AF", "bracket", "crc"],
  ["Unrated", "plain", "tag"],
  ["DC", "plain", "tag"],
  ["Horimiya", "plain", "title"],
  ["Kagura", "plain", "group"],
];

describe("classifyTokenValue", () => {
  it.each(SINGLE_ORACLE)("tags %s (%s) as %s", (value, enclosed, kind) => {
    expect(classifyTokenValue(value, enclosed)).toBe(kind);
  });

  it("reads cyrillic codec spelling as x264", () => {
    const cyrillicHe = String.fromCodePoint(0x0445);
    expect(classifyTokenValue(`${cyrillicHe}264`, "plain")).toBe("codec");
  });

  it("leaves crc-like words in plain text alone", () => {
    expect(classifyTokenValue("292463AF", "plain")).toBe("title");
  });
});

describe("classifyMediaTokens", () => {
  it("merges split WEB-DL, H.264, BD+Remux, and group pairs", () => {
    expect(kindsOf("Blue.Eye.Samurai.S01E01.WEB-DL.1080p.RGzsRutracker")).toContainEqual([
      "WEB-DL",
      "source",
    ]);
    expect(kindsOf("Look.Back.2024.1080p.AMZN.WEB-DL.DDP5.1.H.264")).toContainEqual([
      "H.264",
      "codec",
    ]);
    expect(kindsOf("Look.Back.2024.1080p.AMZN.WEB-DL.DDP5.1.H.264")).toContainEqual([
      "DDP5.1",
      "audio",
    ]);
    expect(kindsOf("Gekijouban Kimetsu no Yaiba Mugen Ressha Hen [BDRemux]")).toContainEqual([
      "BDRemux",
      "source",
    ]);
    expect(kindsOf("Barbie.2023.1080p.WEBRip.x264-Delia_EniaHD")).toContainEqual([
      "Delia_EniaHD",
      "group",
    ]);
  });

  it("expands compound brackets into fragments", () => {
    expect(
      kindsOf("[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen - 01 [BDRip 1080p x265 FLAC]")
    ).toContainEqual(["BDRip", "source"]);
    expect(
      kindsOf("[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen - 01 [BDRip 1080p x265 FLAC]")
    ).toContainEqual(["FLAC", "audio"]);
  });

  it("keeps every member of ampersand groups", () => {
    const pairs = kindsOf("[SweetSub&VCB-Studio] Boogiepop Phantom [01][Ma10p_720p][x265_ac3]");
    const groups = pairs.filter((pair) => pair[1] === "group").map((pair) => pair[0]);
    expect(groups).toEqual(["SweetSub", "VCB-Studio"]);
  });

  it("tags sidecar studio suffixes as studios", () => {
    expect(kindsOf("Dandadan - 01 [WEB-DL CR 1080p AVC DDP].SB.mka")).toContainEqual([
      "SB",
      "studio",
    ]);
    expect(
      kindsOf("Make Heroine ga Oosugiru! - 01 [WEB-DL 1080p 2024].ru_Anilibria.mka")
    ).toContainEqual(["Anilibria", "studio"]);
  });
});
