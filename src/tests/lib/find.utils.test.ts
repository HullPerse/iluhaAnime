import { describe, expect, it } from "vitest";

import enSettings from "@/lib/locale/en/settings.locale";
import ruSettings from "@/lib/locale/ru/settings.locale";
import {
  SETTINGS_FIND_ENTRIES,
  SETTINGS_FIND_EXCLUDED_PREFIXES,
  SETTINGS_FIND_SKIP_KEYS,
  SETTINGS_FIND_TAB_ORDER,
} from "@/config/settings/find.config";
import { searchSettingsFind } from "@/lib/core/find.utils";

const RU: Record<string, string> = ruSettings;
const EN: Record<string, string> = enSettings;

function indexedKeys(): Set<string> {
  return new Set(SETTINGS_FIND_ENTRIES.map((entry) => entry.key));
}

describe("settings/find index", () => {
  it("indexes only keys that exist with text in both locales", () => {
    for (const entry of SETTINGS_FIND_ENTRIES) {
      expect(RU[entry.key], `ru text for ${entry.key}`).toBeTruthy();
      expect(EN[entry.key], `en text for ${entry.key}`).toBeTruthy();
    }
  });

  it("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const entry of SETTINGS_FIND_ENTRIES) {
      const id = `${entry.kind}:${entry.key}`;
      expect(seen.has(id), `duplicate ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it("covers every settings key outside excluded and skipped sets", () => {
    const indexed = indexedKeys();
    const skipped = new Set<string>(SETTINGS_FIND_SKIP_KEYS);
    const missing = Object.keys(RU).filter(
      (key) =>
        !indexed.has(key) &&
        !skipped.has(key) &&
        !SETTINGS_FIND_EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix))
    );
    expect(missing).toEqual([]);
  });

  it("orders tabs as general, notifications, search, torrent, theme, keybinds", () => {
    expect([...SETTINGS_FIND_TAB_ORDER]).toEqual([
      "general",
      "notifications",
      "search",
      "torrent",
      "theme",
      "keybinds",
    ]);
  });
});

describe("settings/find search", () => {
  it("returns nothing for empty or blank queries", () => {
    expect(searchSettingsFind("")).toEqual([]);
    expect(searchSettingsFind("   ")).toEqual([]);
  });

  it("matches russian labels case-insensitively", () => {
    const hits = searchSettingsFind("ПРоКСИ");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.matchedRu)).toBe(true);
    expect(hits[0]?.rangesRu.length).toBeGreaterThan(0);
  });

  it("matches english labels while the ui is russian", () => {
    const hits = searchSettingsFind("proxy");
    expect(hits.length).toBeGreaterThan(0);
    const torrentProxy = hits.find((hit) => hit.entry.key === "settings.torrent.proxy.url");
    expect(torrentProxy?.matchedEn).toBe(true);
    expect(torrentProxy?.matchedRu).toBe(false);
  });

  it("finds tab titles as tab hits", () => {
    const hits = searchSettingsFind("общие");
    const tabHit = hits.find((hit) => hit.entry.kind === "tab");
    expect(tabHit?.entry.tab).toBe("general");
  });

  it("requires every token to match", () => {
    const one = searchSettingsFind("прокси");
    const two = searchSettingsFind("прокси socks5");
    expect(two.length).toBeGreaterThan(0);
    expect(two.length).toBeLessThanOrEqual(one.length);
    expect(searchSettingsFind("прокси несуществующееслово")).toEqual([]);
  });

  it("returns nothing for nonsense queries", () => {
    expect(searchSettingsFind("zzzqqq")).toEqual([]);
  });
});
