import { describe, it, expect } from "vitest";
import { qualityMatch, parseSize, formatSize } from "../index.utils";
import type { Anime } from "@/types";

describe("qualityMatch", () => {
  it("matches 1080p in title", () => {
    expect(qualityMatch("[Group] Anime Title [1080p][HEVC]", "1080p")).toBe(true);
  });

  it("matches 720p in title", () => {
    expect(qualityMatch("[Group] Anime Title [720p]", "720p")).toBe(true);
  });

  it("does not match when quality absent", () => {
    expect(qualityMatch("[Group] Anime Title [HEVC]", "1080p")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(qualityMatch("[Group] Anime [1080P]", "1080p")).toBe(true);
  });
});

describe("parseSize", () => {
  it("parses MiB", () => {
    expect(parseSize("432.6 MiB")).toBe(432.6 * 1048576);
  });

  it("parses GiB", () => {
    expect(parseSize("1.5 GiB")).toBe(1.5 * 1073741824);
  });

  it("returns 0 for unknown format", () => {
    expect(parseSize("unknown")).toBe(0);
  });

  it("parses plain bytes", () => {
    expect(parseSize("512 B")).toBe(512);
  });
});

describe("formatSize (display)", () => {
  it("formats MiB with two decimals", () => {
    expect(formatSize("432.6 MiB")).toBe("432.60 MiB");
  });

  it("formats GiB with two decimals", () => {
    expect(formatSize("1.5 GiB")).toBe("1.50 GiB");
  });
});

describe("sorting logic", () => {
  function sortBy(items: Anime[], sort: "seeders" | "leechers" | "size"): Anime[] {
    return [...items].sort((a, b) => {
      const sortMap = {
        seeders: b.seeders - a.seeders,
        leechers: b.leechers - a.leechers,
        size: parseSize(b.size) - parseSize(a.size),
      };
      return sortMap[sort] ?? 0;
    });
  }

  const items: Anime[] = [
    { title: "A", magnet: "", torrent: "", size: "100 MiB", seeders: 10, leechers: 5, category: "", link: "" },
    { title: "B", magnet: "", torrent: "", size: "200 MiB", seeders: 20, leechers: 3,category: "",  link: "" },
    { title: "C", magnet: "", torrent: "", size: "50 MiB", seeders: 5, leechers: 10, category: "", link: "" },
  ];

  it("sorts by seeders descending", () => {
    const sorted = sortBy(items, "seeders");
    expect(sorted[0].title).toBe("B");
    expect(sorted[2].title).toBe("C");
  });

  it("sorts by leechers descending", () => {
    const sorted = sortBy(items, "leechers");
    expect(sorted[0].title).toBe("C");
    expect(sorted[2].title).toBe("B");
  });

  it("sorts by size descending", () => {
    const sorted = sortBy(items, "size");
    expect(sorted[0].title).toBe("B");
    expect(sorted[1].title).toBe("A");
    expect(sorted[2].title).toBe("C");
  });
});

describe("filtering logic", () => {
  function filterBy(items: Anime[], quality: string): Anime[] {
    return items.filter((res) => {
      if (quality !== "all" && !qualityMatch(res.title, quality)) return false;
      return true;
    });
  }

  const items: Anime[] = [
    { title: "[Group] Show [1080p]", magnet: "", torrent: "", size: "1 GiB", seeders: 10, leechers: 5, category: "", link: "" },
    { title: "[Group] Show [720p]", magnet: "", torrent: "", size: "500 MiB", seeders: 8, leechers: 3, category: "", link: "" },
    { title: "[Group] Show [480p]", magnet: "", torrent: "", size: "200 MiB", seeders: 5, leechers: 2, category: "", link: "" },
  ];

  it("passes all when quality is 'all'", () => {
    expect(filterBy(items, "all")).toHaveLength(3);
  });

  it("filters by 1080p", () => {
    const filtered = filterBy(items, "1080p");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toContain("1080p");
  });

  it("filters by 720p", () => {
    expect(filterBy(items, "720p")).toHaveLength(1);
  });

  it("returns empty when no match", () => {
    expect(filterBy(items, "2160p")).toHaveLength(0);
  });
});
