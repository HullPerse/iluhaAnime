import { describe, expect, it } from "vitest";

import { groupBatchResults } from "@/lib/torrent/batch.utils";
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
});
