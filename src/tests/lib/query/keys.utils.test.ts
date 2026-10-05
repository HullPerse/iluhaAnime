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
    expect(queryKeys.animeDetail(1, "p", true)).toEqual(["anime_detail", 1, "p", 1]);
    expect(queryKeys.animeDetail(1, "p", false)).toEqual(["anime_detail", 1, "p", 0]);
    expect(queryKeys.animeDetail(1, "a", true)).not.toEqual(queryKeys.animeDetail(1, "b", true));
  });

  it("keys inline anime search by the debounced query", () => {
    expect(queryKeys.animeInlineSearch("frie")).toEqual(["anime_inline_search", "frie"]);
    expect(queryKeys.animeInlineSearch("frie")).not.toEqual(
      queryKeys.animeInlineSearch("frier")
    );
  });

  it("keys anime briefs by id", () => {
    expect(queryKeys.animeBrief(21)).toEqual(["anime_brief", 21]);
    expect(queryKeys.animeBrief(21)).not.toEqual(queryKeys.animeBrief(22));
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
});
