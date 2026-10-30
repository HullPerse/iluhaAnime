import { describe, expect, it } from "vitest";

import {
  resolveFatalLocale,
  resolveFatalTexts,
  resolveSplashTexts,
} from "@/lib/core/fatalTexts.utils";

describe("fatal texts contract", () => {
  it("defaults to english without persisted settings", () => {
    localStorage.clear();
    expect(resolveFatalLocale()).toBe("en");
    expect(resolveFatalTexts("en", "chunk").kindLabel).toBe("Chunk load error");
    expect(resolveSplashTexts("en").loading).toBe("Loading...");
    expect(resolveSplashTexts("en").migrations).toBe("Migrations");
    expect(resolveSplashTexts("en").database).toBe("Database");
    expect(resolveSplashTexts("en").spelling).toBe("Spelling");
    expect(resolveSplashTexts("en").index).toBe("Anime index");
    expect(resolveSplashTexts("en").yorhaTitle).toBe("ILUHAANIME");
    expect(resolveSplashTexts("en").yorhaTagline).toBe("You LOSE?! А, не...");
  });

  it("reads the persisted settings language", () => {
    localStorage.setItem(
      "iluha.v1.settings",
      JSON.stringify({ f: 1, store: "settings", sv: 1, ts: 1, data: { language: "ru" } })
    );
    expect(resolveFatalLocale()).toBe("ru");
    expect(resolveFatalTexts("ru", "startup").kindLabel).toBe("Ошибка запуска");
    expect(resolveSplashTexts("ru").fastLaunch).toBe("Не показывать заставку");
  });

  it("ignores malformed persisted payloads", () => {
    localStorage.setItem("iluha.v1.settings", "{broken");
    expect(resolveFatalLocale()).toBe("en");
    localStorage.setItem("iluha.v1.settings", JSON.stringify({ data: { language: "fr" } }));
    expect(resolveFatalLocale()).toBe("en");
  });

  it("resolves the yorha pod banner in both languages", () => {
    expect(resolveFatalTexts("en", "chunk").yorhaBanner).toBe("ERROR // SYSTEM FAILURE");
    expect(resolveFatalTexts("ru", "chunk").yorhaBanner).toBe("ERROR // SYSTEM FAILURE");
  });
});
