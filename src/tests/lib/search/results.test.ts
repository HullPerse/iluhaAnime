import { describe, expect, it } from "vitest";

import { filterAnimeResults, sortAnimeResults } from "@/lib/search/results.utils";
import type { Anime } from "@/types/torrent";
import type { SearchFilters } from "@/types/search";

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

const defaultFilters: SearchFilters = {
  codec: "all",
  hasMagnet: false,
  language: "all",
  minSeeders: 0,
  quality: "all",
  sizeMax: 0,
  sizeMin: 0,
};

const filters = (overrides: Partial<SearchFilters>): SearchFilters => ({
  ...defaultFilters,
  ...overrides,
});

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

describe("filterAnimeResults", () => {
  it("passes all with default filters", () => {
    expect(filterAnimeResults(filterItems, defaultFilters)).toHaveLength(4);
  });

  it("filters by minSeeders", () => {
    const result = filterAnimeResults(filterItems, filters({ minSeeders: 8 }))!;
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("1080p");
    expect(result[1].title).toContain("720p");
  });

  it("filters by hasMagnet", () => {
    const result = filterAnimeResults(filterItems, filters({ hasMagnet: true }))!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.magnet.startsWith("magnet:"))).toBe(true);
  });

  it("filters by quality 1080p", () => {
    const result = filterAnimeResults(filterItems, filters({ quality: "1080p" }))!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title.includes("1080p"))).toBe(true);
  });

  it("filters by language ru", () => {
    const result = filterAnimeResults(filterItems, filters({ language: "ru" }))!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("RUS");
  });

  it("filters by language dual audio", () => {
    const result = filterAnimeResults(filterItems, filters({ language: "dual" }))!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Dual-Audio");
  });

  it("filters by size min 600 MiB", () => {
    const result = filterAnimeResults(filterItems, filters({ sizeMin: 600 }))!;
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("1080p");
    expect(result[1].title).toContain("1080p");
  });

  it("filters by size max 300 MiB", () => {
    const result = filterAnimeResults(filterItems, filters({ sizeMax: 300 }))!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("480p");
  });

  it("filters by size range 300-900 MiB", () => {
    expect(filterAnimeResults(filterItems, filters({ sizeMin: 300, sizeMax: 900 }))).toHaveLength(
      2
    );
  });

  it("filters by codec HEVC", () => {
    const result = filterAnimeResults(filterItems, filters({ codec: "HEVC" }))!;
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title.includes("HEVC"))).toBe(true);
  });

  it("filters by codec x264", () => {
    expect(filterAnimeResults(filterItems, filters({ codec: "x264" }))!).toHaveLength(2);
  });

  it("combines multiple filters", () => {
    const result = filterAnimeResults(
      filterItems,
      filters({ hasMagnet: true, minSeeders: 3, quality: "1080p" })
    )!;
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("[Group] Show [1080p]");
  });

  it("returns undefined for undefined input", () => {
    expect(filterAnimeResults(undefined, defaultFilters)).toBeUndefined();
  });
});
