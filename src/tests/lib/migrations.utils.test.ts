import { describe, expect, it } from "vitest";

import { detectMigrations, TRACKED_STORES } from "@/lib/migrations.utils";
import {
  ANILIST_FRIENDS_SCHEMA_VERSION,
  ANILIST_NOTIFICATIONS_SCHEMA_VERSION,
} from "@/store/anilist.store";
import { CACHE_SCHEMA_VERSION } from "@/store/cache.store";
import { CATEGORY_SCHEMA_VERSION } from "@/store/category.store";
import { COLLECTION_SCHEMA_VERSION } from "@/store/collection.store";
import { MEDIA_SCHEMA_VERSION } from "@/store/media.store";
import { NOTIFICATION_SCHEMA_VERSION } from "@/store/notification.store";
import { PLAYER_SCHEMA_VERSION } from "@/store/player.store";
import { SEARCH_SCHEMA_VERSION } from "@/store/search.store";
import { SETTINGS_SCHEMA_VERSION } from "@/store/settings.store";
import { THEME_SCHEMA_VERSION } from "@/store/theme.store";

const LIVE: Record<string, number> = {
  settings: SETTINGS_SCHEMA_VERSION,
  theme: THEME_SCHEMA_VERSION,
  cache: CACHE_SCHEMA_VERSION,
  search: SEARCH_SCHEMA_VERSION,
  "collection-ui": COLLECTION_SCHEMA_VERSION,
  notifications: NOTIFICATION_SCHEMA_VERSION,
  anilistFriends: ANILIST_FRIENDS_SCHEMA_VERSION,
  anilistReleaseObservations: ANILIST_NOTIFICATIONS_SCHEMA_VERSION,
  player: PLAYER_SCHEMA_VERSION,
  media: MEDIA_SCHEMA_VERSION,
  categories: CATEGORY_SCHEMA_VERSION,
  coverCorrections: 3,
};

function envelope(sv: number): string {
  return JSON.stringify({ f: 1, store: "settings", sv, ts: 1, data: {} });
}

describe("splash migrations contract", () => {
  it("tracks every persisted store at its live schema version", () => {
    for (const tracked of TRACKED_STORES) {
      expect(`${tracked.store}:${tracked.current}`).toBe(`${tracked.store}:${LIVE[tracked.store]}`);
    }
  });

  it("reports stores persisted below their current version", () => {
    localStorage.clear();
    localStorage.setItem("iluha.v1.settings", envelope(44));
    localStorage.setItem("iluha.v1.theme", envelope(0));
    expect(detectMigrations()).toEqual([
      { store: "settings", from: 44, to: SETTINGS_SCHEMA_VERSION },
      { store: "theme", from: 0, to: THEME_SCHEMA_VERSION },
    ]);
  });

  it("ignores missing, current, and malformed payloads", () => {
    localStorage.clear();
    localStorage.setItem("iluha.v1.cache", envelope(5));
    localStorage.setItem("iluha.v1.search", "{broken");
    expect(detectMigrations()).toEqual([]);
  });
});
