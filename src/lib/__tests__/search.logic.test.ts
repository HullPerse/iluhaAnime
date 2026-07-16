import { describe, it, expect } from "vitest";
import { qualityMatch, parseSize, formatSize, detectLanguages } from "../index.utils";
import type { Anime, SearchFilters } from "@/types";
import { sortAnimeResults, filterAnimeResults } from "../search.logic";

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

const sortItems: Anime[] = [
  { title: "A", magnet: "", torrent: "", size: "100 MiB", seeders: 10, leechers: 5, category: "", link: "" },
  { title: "B", magnet: "", torrent: "", size: "200 MiB", seeders: 20, leechers: 3, category: "", link: "" },
  { title: "C", magnet: "", torrent: "", size: "50 MiB", seeders: 5, leechers: 10, category: "", link: "" },
];

describe("sortAnimeResults", () => {
  it("sorts by seeders desc", () => {
    const sorted = sortAnimeResults(sortItems, "seeders", "desc")!;
    expect(sorted[0].title).toBe("B");
    expect(sorted[2].title).toBe("C");
  });

  it("sorts by seeders asc", () => {
    const sorted = sortAnimeResults(sortItems, "seeders", "asc")!;
    expect(sorted[0].title).toBe("C");
    expect(sorted[2].title).toBe("B");
  });

  it("sorts by leechers desc", () => {
    const sorted = sortAnimeResults(sortItems, "leechers", "desc")!;
    expect(sorted[0].title).toBe("C");
    expect(sorted[2].title).toBe("B");
  });

  it("sorts by leechers asc", () => {
    const sorted = sortAnimeResults(sortItems, "leechers", "asc")!;
    expect(sorted[0].title).toBe("B");
    expect(sorted[2].title).toBe("C");
  });

  it("sorts by size desc", () => {
    const sorted = sortAnimeResults(sortItems, "size", "desc")!;
    expect(sorted[0].title).toBe("B");
    expect(sorted[2].title).toBe("C");
  });

  it("sorts by size asc", () => {
    const sorted = sortAnimeResults(sortItems, "size", "asc")!;
    expect(sorted[0].title).toBe("C");
    expect(sorted[2].title).toBe("B");
  });

  it("returns undefined for undefined input", () => {
    expect(sortAnimeResults(undefined, "seeders", "desc")).toBeUndefined();
  });
});

const filterItems: Anime[] = [
  { title: "[Group] Show [1080p][HEVC][MultiSub][RUS]", magnet: "magnet:?xt=1", torrent: "", size: "1 GiB", seeders: 10, leechers: 5, category: "", link: "" },
  { title: "[Group] Show [720p][x264][ENG]", magnet: "", torrent: "", size: "500 MiB", seeders: 8, leechers: 3, category: "", link: "" },
  { title: "[Group] Show [480p][HEVC]", magnet: "magnet:?xt=2", torrent: "", size: "200 MiB", seeders: 5, leechers: 2, category: "", link: "" },
  { title: "[Different] Show [1080p][x264][Dual-Audio]", magnet: "", torrent: "", size: "800 MiB", seeders: 2, leechers: 1, category: "", link: "" },
];

describe("filterAnimeResults", () => {
  it("passes all with default filters", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 0, sizeMax: 0, codec: "all" };
    expect(filterAnimeResults(filterItems, f)).toHaveLength(4);
  });

  it("filters by minSeeders", () => {
    const f: SearchFilters = { minSeeders: 8, hasMagnet: false, quality: "all", language: "all", sizeMin: 0, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("1080p");
    expect(result[1].title).toContain("720p");
  });

  it("filters by hasMagnet", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: true, quality: "all", language: "all", sizeMin: 0, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.magnet.startsWith("magnet:"))).toBe(true);
  });

  it("filters by quality 1080p", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "1080p", language: "all", sizeMin: 0, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title.includes("1080p"))).toBe(true);
  });

  it("filters by language ru", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "ru", sizeMin: 0, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("RUS");
  });

  it("filters by language dual audio", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "dual", sizeMin: 0, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Dual-Audio");
  });

  it("filters by size min 600 MiB", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 600, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("1080p");
    expect(result[1].title).toContain("1080p");
  });

  it("filters by size max 300 MiB", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 0, sizeMax: 300, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("480p");
  });

  it("filters by size range 300-900 MiB", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 300, sizeMax: 900, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
  });

  it("filters by codec HEVC", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 0, sizeMax: 0, codec: "HEVC" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title.includes("HEVC"))).toBe(true);
  });

  it("filters by codec x264", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 0, sizeMax: 0, codec: "x264" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
  });

  it("combines multiple filters", () => {
    const f: SearchFilters = { minSeeders: 3, hasMagnet: true, quality: "1080p", language: "all", sizeMin: 0, sizeMax: 0, codec: "all" };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("[Group] Show [1080p]");
  });

  it("returns undefined for undefined input", () => {
    const f: SearchFilters = { minSeeders: 0, hasMagnet: false, quality: "all", language: "all", sizeMin: 0, sizeMax: 0, codec: "all" };
    expect(filterAnimeResults(undefined, f)).toBeUndefined();
  });
});
