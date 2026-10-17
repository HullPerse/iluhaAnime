import { describe, expect, it } from "vitest";

import { queryKeys } from "@/lib/query/keys.utils";

describe("queryKeys", () => {
  it("returns stable keys for the same inputs", () => {
    expect(queryKeys.torrentFiles(3)).toEqual(queryKeys.torrentFiles(3));
    expect(queryKeys.animeFranchise(21)).toEqual(["franchise", 21]);
  });

  it("separates torrent file and diagnostics namespaces", () => {
    expect(queryKeys.torrentFiles(3)).not.toEqual(queryKeys.torrentDiagnostics(3));
  });

  it("encodes proxy and login state into the detail key", () => {
    expect(queryKeys.animeFull(1, "p", true)).toEqual(["anime_full", 1, "p", 1]);
    expect(queryKeys.animeFull(1, "p", false)).toEqual(["anime_full", 1, "p", 0]);
    expect(queryKeys.animeFull(1, "a", true)).not.toEqual(queryKeys.animeFull(1, "b", true));
  });

  it("keys inline anime search by the debounced query and adult flag", () => {
    expect(queryKeys.animeInlineSearch("frie", false)).toEqual(["anime_inline_search", "frie", 0]);
    expect(queryKeys.animeInlineSearch("frie", true)).toEqual(["anime_inline_search", "frie", 1]);
    expect(queryKeys.animeInlineSearch("frie", false)).not.toEqual(
      queryKeys.animeInlineSearch("frier", false)
    );
    expect(queryKeys.animeInlineSearch("frie", false)).not.toEqual(
      queryKeys.animeInlineSearch("frie", true)
    );
  });

  it("keeps collection data on a single shared key", () => {
    expect(queryKeys.collectionData()).toEqual(["collection-data"]);
  });

  it("includes sort and proxy in the torrent search key", () => {
    expect(queryKeys.torrentSearch("nyaa", "naruto", 1, 2, "seeders", "desc", "proxy")).toEqual([
      "animeScraper",
      "nyaa",
      "naruto",
      1,
      2,
      "seeders",
      "desc",
      "proxy",
    ]);
  });

  it("exposes scope roots for prefix-wide operations", () => {
    expect(queryKeys.activityScope()).toEqual(["anilist_activity"]);
    expect(queryKeys.searchSessionsScope()).toEqual(["search_sessions"]);
    expect(queryKeys.torrentSearchScope()).toEqual(["animeScraper"]);
    expect(queryKeys.wallpaperScope()).toEqual(["dither-wallpaper"]);
    expect(queryKeys.extraFilesScope()).toEqual(["extra_files"]);
    expect(queryKeys.coverResolveScope("k")).toEqual(["cover_resolve", "k"]);
  });

  it("keys posters, cover cascades, dht stats, and franchise refreshes", () => {
    expect(queryKeys.torrentPoster("u")).toEqual(["torrent_poster", "u"]);
    expect(queryKeys.coverResolve("k", [1], "learned", "local")).toEqual([
      "cover_resolve",
      "k",
      [1],
      "learned",
      "local",
    ]);
    expect(queryKeys.dhtStats()).toEqual(["dht-stats"]);
    expect(queryKeys.animeFranchiseRefresh(21, 0)).toEqual(["franchise", 21, 0]);
    expect(queryKeys.animeFranchiseRefresh(21, 0)).not.toEqual(
      queryKeys.animeFranchiseRefresh(21, 1)
    );
  });
});
