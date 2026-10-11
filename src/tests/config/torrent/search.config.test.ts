import { describe, expect, it } from "vitest";

import { settingsSearchSchema } from "@/config/settings/tabs.config";
import { torrentSearchSchema } from "@/config/torrent/search.config";

describe("torrentSearchSchema", () => {
  it("defaults every field when the query string is empty", () => {
    expect(torrentSearchSchema.parse({})).toEqual({
      q: "",
      sort: "name",
      dir: "asc",
      page: 1,
      lifecycle: "all",
    });
  });

  it("keeps valid values", () => {
    expect(
      torrentSearchSchema.parse({
        q: "naruto",
        sort: "speed",
        dir: "desc",
        page: 3,
        lifecycle: "seeding",
      })
    ).toEqual({
      q: "naruto",
      sort: "speed",
      dir: "desc",
      page: 3,
      lifecycle: "seeding",
    });
  });

  it("falls back per field on malformed values", () => {
    expect(
      torrentSearchSchema.parse({
        q: 42,
        sort: "bogus",
        dir: "sideways",
        page: "abc",
        lifecycle: "weird",
      })
    ).toEqual({
      q: "",
      sort: "name",
      dir: "asc",
      page: 1,
      lifecycle: "all",
    });
  });
});

describe("settingsSearchSchema", () => {
  it("defaults the tab to general", () => {
    expect(settingsSearchSchema.parse({})).toEqual({ tab: "general" });
    expect(settingsSearchSchema.parse({ tab: "bogus" })).toEqual({ tab: "general" });
  });

  it("keeps a known tab including sqlite", () => {
    expect(settingsSearchSchema.parse({ tab: "theme" })).toEqual({ tab: "theme" });
    expect(settingsSearchSchema.parse({ tab: "sqlite" })).toEqual({ tab: "sqlite" });
  });
});
