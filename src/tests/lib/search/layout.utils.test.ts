import { describe, expect, it } from "vitest";

import { flipLayout, looksCyrillic } from "@/lib/search/layout.utils";
import { suggestSpellingWithReason } from "@/lib/search/resolve.utils";

describe("search/layout flip", () => {
  it("maps english typed in russian layout back to english", () => {
    expect(flipLayout("Руддщ")).toBe("Hello");
  });

  it("maps russian typed in english layout back to russian", () => {
    expect(flipLayout("ghbdtn")).toBe("привет");
  });

  it("leaves digits and unknown symbols alone", () => {
    expect(flipLayout("s2")).toBe("ы2");
    expect(looksCyrillic("ghbdtn")).toBe(false);
    expect(looksCyrillic("привет")).toBe(true);
  });
});

describe("search/layout correction", () => {
  it("recovers english from a russian-layout query with a penalty flag", () => {
    expect(suggestSpellingWithReason("Руддщ", { history: ["hello"] })).toMatchObject({
      correction: "Hello",
      evidence: { layout: true },
    });
  });

  it("recovers russian from an english-layout query", () => {
    expect(suggestSpellingWithReason("ghbdtn", { history: ["привет"] })).toMatchObject({
      correction: "привет",
      evidence: { layout: true },
    });
  });

  it("never lets a flipped guess beat a direct exact hit", () => {
    expect(suggestSpellingWithReason("hello", { history: ["hello"] })).toBeNull();
  });
});
