import { describe, it, expect } from "vitest";

import { qualityMatch, parseSize, formatSize } from "@/lib/index.utils";
import { sortAnimeResults, filterAnimeResults } from "@/lib/search.logic";
import type { Anime } from "@/types";
import type { SearchFilters } from "@/types/search";

describe("qualityMatch", () => {
  it("matches 1080p in title", () => {
    expect(qualityMatch("[Group] Anime Title [1080p][HEVC]", "1080p")).toBe(
      true
    );
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
    expect(parseSize("432.6 MiB")).toBe(432.6 * 1_048_576);
  });

  it("parses GiB", () => {
    expect(parseSize("1.5 GiB")).toBe(1.5 * 1_073_741_824);
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
  function sortBy(
    items: Anime[],
    sort: "seeders" | "leechers" | "size"
  ): Anime[] {
    return [...items].sort((a, b) => {
      const sortMap = {
        leechers: b.leechers - a.leechers,
        seeders: b.seeders - a.seeders,
        size: parseSize(b.size) - parseSize(a.size),
      };
      return sortMap[sort] ?? 0;
    });
  }

  const items: Anime[] = [
    {
      category: "",
      leechers: 5,
      link: "",
      magnet: "",
      seeders: 10,
      size: "100 MiB",
      title: "A",
      torrent: "",
    },
    {
      category: "",
      leechers: 3,
      link: "",
      magnet: "",
      seeders: 20,
      size: "200 MiB",
      title: "B",
      torrent: "",
    },
    {
      category: "",
      leechers: 10,
      link: "",
      magnet: "",
      seeders: 5,
      size: "50 MiB",
      title: "C",
      torrent: "",
    },
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
    {
      category: "",
      leechers: 5,
      link: "",
      magnet: "",
      seeders: 10,
      size: "1 GiB",
      title: "[Group] Show [1080p]",
      torrent: "",
    },
    {
      category: "",
      leechers: 3,
      link: "",
      magnet: "",
      seeders: 8,
      size: "500 MiB",
      title: "[Group] Show [720p]",
      torrent: "",
    },
    {
      category: "",
      leechers: 2,
      link: "",
      magnet: "",
      seeders: 5,
      size: "200 MiB",
      title: "[Group] Show [480p]",
      torrent: "",
    },
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
  {
    category: "",
    leechers: 5,
    link: "",
    magnet: "",
    seeders: 10,
    size: "100 MiB",
    title: "A",
    torrent: "",
  },
  {
    category: "",
    leechers: 3,
    link: "",
    magnet: "",
    seeders: 20,
    size: "200 MiB",
    title: "B",
    torrent: "",
  },
  {
    category: "",
    leechers: 10,
    link: "",
    magnet: "",
    seeders: 5,
    size: "50 MiB",
    title: "C",
    torrent: "",
  },
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
  {
    category: "",
    leechers: 5,
    link: "",
    magnet: "magnet:?xt=1",
    seeders: 10,
    size: "1 GiB",
    title: "[Group] Show [1080p][HEVC][MultiSub][RUS]",
    torrent: "",
  },
  {
    category: "",
    leechers: 3,
    link: "",
    magnet: "",
    seeders: 8,
    size: "500 MiB",
    title: "[Group] Show [720p][x264][ENG]",
    torrent: "",
  },
  {
    category: "",
    leechers: 2,
    link: "",
    magnet: "magnet:?xt=2",
    seeders: 5,
    size: "200 MiB",
    title: "[Group] Show [480p][HEVC]",
    torrent: "",
  },
  {
    category: "",
    leechers: 1,
    link: "",
    magnet: "",
    seeders: 2,
    size: "800 MiB",
    title: "[Different] Show [1080p][x264][Dual-Audio]",
    torrent: "",
  },
];

describe("filterAnimeResults", () => {
  it("passes all with default filters", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    expect(filterAnimeResults(filterItems, f)).toHaveLength(4);
  });

  it("filters by minSeeders", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 8,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("1080p");
    expect(result[1].title).toContain("720p");
  });

  it("filters by hasMagnet", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: true,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.magnet.startsWith("magnet:"))).toBe(true);
  });

  it("filters by quality 1080p", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "1080p",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title.includes("1080p"))).toBe(true);
  });

  it("filters by language ru", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "ru",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("RUS");
  });

  it("filters by language dual audio", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "dual",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Dual-Audio");
  });

  it("filters by size min 600 MiB", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 600,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("1080p");
    expect(result[1].title).toContain("1080p");
  });

  it("filters by size max 300 MiB", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 300,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("480p");
  });

  it("filters by size range 300-900 MiB", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 900,
      sizeMin: 300,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
  });

  it("filters by codec HEVC", () => {
    const f: SearchFilters = {
      codec: "HEVC",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title.includes("HEVC"))).toBe(true);
  });

  it("filters by codec x264", () => {
    const f: SearchFilters = {
      codec: "x264",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(2);
  });

  it("combines multiple filters", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: true,
      language: "all",
      minSeeders: 3,
      quality: "1080p",
      sizeMax: 0,
      sizeMin: 0,
    };
    const result = filterAnimeResults(filterItems, f)!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("[Group] Show [1080p]");
  });

  it("returns undefined for undefined input", () => {
    const f: SearchFilters = {
      codec: "all",
      hasMagnet: false,
      language: "all",
      minSeeders: 0,
      quality: "all",
      sizeMax: 0,
      sizeMin: 0,
    };
    expect(filterAnimeResults(undefined, f)).toBeUndefined();
  });
});
