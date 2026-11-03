import { describe, expect, it } from "vitest";

import { batchEpisodeNumber, groupBatchResults } from "@/lib/torrent/batch.utils";
import type { Anime } from "@/types/torrent/torrent";

function item(title: string): Anime {
  return {
    title,
    magnet: "magnet:?xt=urn:btih:test",
    torrent: "",
    size: "1 GB",
    seeders: 1,
    leechers: 0,
    category: "",
    link: title,
  };
}

describe("groupBatchResults", () => {
  it("groups episodes of one anime from one release group", () => {
    const groups = groupBatchResults([
      item("[Erai-raws] Naruto - 01 [1080p][Multiple Subtitle].mkv"),
      item("[Erai-raws] Naruto - 02 [1080p][Multiple Subtitle].mkv"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].title.toLowerCase()).toContain("naruto");
  });

  it("keeps different release groups apart", () => {
    const groups = groupBatchResults([
      item("[Erai-raws] Naruto - 01 [1080p].mkv"),
      item("[SubsPlease] Naruto - 01 [1080p].mkv"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps seasons of the same anime apart and reads the season", () => {
    const groups = groupBatchResults([
      item("[Erai-raws] Sousou no Frieren 2nd Season - 09 [1080p].mkv"),
      item("[Erai-raws] Sousou no Frieren - 28 [1080p].mkv"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.some((group) => group.season === 2)).toBe(true);
  });

  it("sorts episodes numerically inside a group", () => {
    const groups = groupBatchResults([
      item("[Erai-raws] Naruto - 10 [1080p].mkv"),
      item("[Erai-raws] Naruto - 02 [1080p].mkv"),
    ]);
    expect(groups[0].items.map((entry) => batchEpisodeNumber(entry))).toEqual([2, 10]);
  });
});
