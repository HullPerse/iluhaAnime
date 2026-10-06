import { describe, expect, it } from "vitest";

import {
  normalizeTagValue,
  parseTorrentTags,
  torrentTagsToFilters,
} from "@/lib/search/torrentTags.utils";

describe("parseTorrentTags", () => {
  it("splits tags from clean text", () => {
    const parsed = parseTorrentTags("frieren quality=1080p seeds>=10");
    expect(parsed.cleanQuery).toBe("frieren");
    expect(parsed.tags.map((tag) => tag.key)).toEqual(["quality", "seeds"]);
    expect(parsed.tags[0]).toMatchObject({ op: "=", value: "1080p" });
    expect(parsed.tags[1]).toMatchObject({ op: ">=", value: "10" });
  });

  it("keeps invalid tokens as text", () => {
    const parsed = parseTorrentTags("frieren quality=4d seeds>=abc foo=bar");
    expect(parsed.cleanQuery).toBe("frieren quality=4d seeds>=abc foo=bar");
    expect(parsed.tags).toEqual([]);
  });

  it("tracks token spans for highlight", () => {
    const parsed = parseTorrentTags("one piece codec=hevc");
    expect(parsed.tags).toHaveLength(1);
    expect("one piece ".slice(parsed.tags[0].start, parsed.tags[0].end)).toBe("");
    expect("one piece codec=hevc".slice(parsed.tags[0].start, parsed.tags[0].end)).toBe(
      "codec=hevc"
    );
  });

  it("normalizes aliases and case", () => {
    expect(
      normalizeTagValue({ key: "quality", op: "=", value: "4K", raw: "", start: 0, end: 0 })
    ).toBe("2160p");
    expect(
      normalizeTagValue({ key: "codec", op: "=", value: "hevc", raw: "", start: 0, end: 0 })
    ).toBe("HEVC");
    expect(
      normalizeTagValue({ key: "source", op: "=", value: "Nyaa", raw: "", start: 0, end: 0 })
    ).toBe("nyaa");
  });
});

describe("torrentTagsToFilters", () => {
  it("maps tags onto search filters", () => {
    const { filters, source } = torrentTagsToFilters(
      parseTorrentTags("frieren quality=1080p codec=hevc lang=ru seeds>=10 size<2GB source=nyaa")
        .tags
    );
    expect(filters).toMatchObject({
      quality: "1080p",
      codec: "HEVC",
      language: "ru",
      minSeeders: 10,
      sizeMax: 2048,
    });
    expect(source).toBe("nyaa");
  });

  it("maps size bounds by operator", () => {
    const { filters } = torrentTagsToFilters(parseTorrentTags("x size>700MB").tags);
    expect(filters.sizeMin).toBe(700);
    expect(filters.sizeMax).toBeUndefined();
  });
});
