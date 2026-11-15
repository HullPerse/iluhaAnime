import { beforeEach, describe, expect, it } from "vitest";

import { CHANGELOG } from "@/config/system/changelog.config";
import {
  isChangelogLocaleLoaded,
  loadChangelogLocale,
  translate,
} from "@/lib/locale/i18n.utils";
import ru from "@/lib/locale/ru";
import { ruChangelog } from "@/lib/locale/ru.changelog";
import { patchSettings } from "@/store/settings.store";

describe("locale dictionary", () => {
  const RU: Record<string, string> = { ...ru, ...ruChangelog };
  const keys = new Set(Object.keys(RU));

  beforeEach(() => {
    patchSettings({ language: "ru" });
  });

  it("loads the changelog strings on demand", async () => {
    const entryKey = CHANGELOG.flatMap(({ added, changed, fixed }) => [
      ...added,
      ...changed,
      ...fixed,
    ])[0]?.key;
    if (entryKey === undefined) throw new Error("no changelog entries");

    expect(translate(entryKey)).toBe(entryKey);
    expect(isChangelogLocaleLoaded()).toBe(false);

    await loadChangelogLocale();

    expect(isChangelogLocaleLoaded()).toBe(true);
    expect(translate(entryKey)).toBe(RU[entryKey]);
  });

  it("never ships an empty string", () => {
    const blank = [...keys].filter((key) => (RU[key] ?? "").trim() === "");
    expect(blank).toEqual([]);
  });

  describe("changelog entries", () => {
    const entries = CHANGELOG.flatMap(({ version, added, changed, fixed }) =>
      [...added, ...changed, ...fixed].map((entry) => ({ ...entry, version }))
    );

    it("has entries to check", () => {
      expect(entries.length).toBeGreaterThan(0);
    });

    it("resolves every entry in the Russian dictionary", () => {
      const missing = entries
        .filter(({ key }) => !keys.has(key))
        .map(({ key, version }) => `ru ${version}: ${key}`);
      expect(missing).toEqual([]);
    });

    it("translates every entry instead of echoing the key", () => {
      const untranslated = entries
        .filter(({ key }) => translate(key) === key)
        .map(({ key }) => `ru:${key}`);
      expect(untranslated).toEqual([]);
    });

    it("names the scope of every entry", () => {
      const scopes = new Set(entries.map(({ scope }) => `settings.changelog.scope.${scope}`));
      expect([...scopes].filter((key) => !keys.has(key))).toEqual([]);
    });

    it("does not repeat a key", () => {
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const { key } of entries) {
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
      }
      expect(duplicates).toEqual([]);
    });
  });
});
