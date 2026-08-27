import { describe, expect, it, vi, afterEach } from "vitest";

import { detectSystemLocale } from "@/lib/locale.utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectSystemLocale", () => {
  it("returns en when navigator is unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectSystemLocale()).toBe("en");
  });

  it("returns ru for a Russian system language", () => {
    vi.stubGlobal("navigator", {
      language: "ru-RU",
      languages: ["ru-RU", "en-US"],
    });
    expect(detectSystemLocale()).toBe("ru");
  });

  it("returns en for an English system language", () => {
    vi.stubGlobal("navigator", {
      language: "en-US",
      languages: ["en-US"],
    });
    expect(detectSystemLocale()).toBe("en");
  });

  it("returns ru when Russian is among the preferred languages", () => {
    vi.stubGlobal("navigator", {
      language: "en-US",
      languages: ["en-US", "ru", "fr"],
    });
    expect(detectSystemLocale()).toBe("ru");
  });

  it("returns en for non-Russian preferred languages", () => {
    vi.stubGlobal("navigator", {
      language: "de-DE",
      languages: ["de-DE", "fr-FR"],
    });
    expect(detectSystemLocale()).toBe("en");
  });

  it("falls back to language when the languages list is missing", () => {
    vi.stubGlobal("navigator", { language: "ru" });
    expect(detectSystemLocale()).toBe("ru");
    vi.stubGlobal("navigator", { language: "en-GB" });
    expect(detectSystemLocale()).toBe("en");
  });
});
