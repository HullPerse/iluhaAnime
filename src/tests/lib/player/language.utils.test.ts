import { describe, expect, it } from "vitest";

import { languageName, normalizeLangCode } from "@/lib/player/language.utils";

describe("player/language normalize", () => {
  it("maps three-letter mpv codes to two-letter ones", () => {
    expect(normalizeLangCode("rus")).toBe("ru");
    expect(normalizeLangCode("eng")).toBe("en");
    expect(normalizeLangCode("ger")).toBe("de");
    expect(normalizeLangCode("deu")).toBe("de");
    expect(normalizeLangCode("jpn")).toBe("ja");
    expect(normalizeLangCode("kor")).toBe("ko");
    expect(normalizeLangCode("chi")).toBe("zh");
  });

  it("passes two-letter codes through and ignores case", () => {
    expect(normalizeLangCode("ja")).toBe("ja");
    expect(normalizeLangCode("de")).toBe("de");
    expect(normalizeLangCode("RUS")).toBe("ru");
  });

  it("treats missing and placeholder codes as empty", () => {
    expect(normalizeLangCode(undefined)).toBe("");
    expect(normalizeLangCode("")).toBe("");
    expect(normalizeLangCode("und")).toBe("");
    expect(normalizeLangCode("unknown")).toBe("");
  });
});

describe("player/language names", () => {
  it("resolves english names like the MPC right column", () => {
    expect(languageName("rus")).toBe("Russian");
    expect(languageName("eng")).toBe("English");
    expect(languageName("ger")).toBe("German");
    expect(languageName("jpn")).toBe("Japanese");
    expect(languageName("kor")).toBe("Korean");
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName("de")).toBe("German");
  });

  it("returns empty for missing and placeholder codes", () => {
    expect(languageName(undefined)).toBe("");
    expect(languageName("und")).toBe("");
    expect(languageName("unknown")).toBe("");
  });

  it("falls back to the uppercased code for unknown languages", () => {
    expect(languageName("xx")).toBe("XX");
  });
});
