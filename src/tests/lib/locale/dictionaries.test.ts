import { describe, expect, it } from "vitest";

import { CHANGELOG } from "@/config/settings/changelog.config";
import en from "@/lib/locale/en";
import { translate } from "@/lib/locale/i18n.utils";
import ru from "@/lib/locale/ru";
import type { TranslationKey } from "@/types/i18n";

/**
 * Plural forms live under `${key}.${Intl.PluralRules category}`, and the category sets differ per
 * language: Russian needs `one`/`few`/`many`, English needs `one` plus the bare key for `other`,
 * and `resolvePluralKey` falls back to the Russian suffix when English has none. A plural form is
 * therefore the only key allowed to exist in a single language, and only while its base key is
 * defined in both.
 */
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other|past|future)$/;

function pluralBase(key: string): string | null {
  const match = PLURAL_SUFFIX.exec(key);
  return match ? key.slice(0, -match[0].length) : null;
}

const enDictionary: Record<string, string> = en;
const ruDictionary: Record<string, string> = ru;
const enKeys = new Set(Object.keys(enDictionary));
const ruKeys = new Set(Object.keys(ruDictionary));

describe("locale dictionaries", () => {
  it("exposes every English key through the Russian dictionary", () => {
    // `TranslationKey` is `keyof typeof ru`, so an English-only key can never be requested.
    expect([...enKeys].filter((key) => !ruKeys.has(key))).toEqual([]);
  });

  it("leaves a language gap only on a plural form of a shared key", () => {
    const unexplained = [...ruKeys].filter((key) => {
      if (enKeys.has(key)) return false;
      const base = pluralBase(key);
      return base === null || !enKeys.has(base) || !ruKeys.has(base);
    });
    expect(unexplained).toEqual([]);
  });

  it("never ships an empty string", () => {
    const blank = [
      ...[...enKeys]
        .filter((key) => (enDictionary[key] ?? "").trim() === "")
        .map((key) => `en:${key}`),
      ...[...ruKeys]
        .filter((key) => (ruDictionary[key] ?? "").trim() === "")
        .map((key) => `ru:${key}`),
    ];
    expect(blank).toEqual([]);
  });
});

describe("changelog entries", () => {
  const entries = CHANGELOG.flatMap(({ version, added, changed, fixed }) =>
    [...added, ...changed, ...fixed].map((entry) => ({ ...entry, version }))
  );

  it("has entries to check", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("resolves every entry in both dictionaries", () => {
    const missing = entries.flatMap(({ key, version }) => {
      const gaps: string[] = [];
      if (!enKeys.has(key)) gaps.push(`en ${version}: ${key}`);
      if (!ruKeys.has(key)) gaps.push(`ru ${version}: ${key}`);
      return gaps;
    });
    expect(missing).toEqual([]);
  });

  it("translates every entry instead of echoing the key", () => {
    const untranslated = entries.flatMap(({ key }) => {
      const localized = key as TranslationKey;
      const gaps: string[] = [];
      if (translate("en", localized) === key) gaps.push(`en:${key}`);
      if (translate("ru", localized) === key) gaps.push(`ru:${key}`);
      return gaps;
    });
    expect(untranslated).toEqual([]);
  });

  it("names the scope of every entry", () => {
    // The scope label is built at runtime as `settings.changelog.scope.${scope}`.
    const scopes = new Set(entries.map(({ scope }) => `settings.changelog.scope.${scope}`));
    expect([...scopes].filter((key) => !enKeys.has(key) || !ruKeys.has(key))).toEqual([]);
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
