import { bench, group } from "@pmndrs/labs";
// Query-key building plus JSON serialization, which is what TanStack
// Query pays per key (hashing). Representative call mix across search,
// torrent, collection, and player surfaces.
// Budget (avg/iter, Ryzen 7 5800X/node 26, 2026-10-08): build 38us,
// build+stringify 265us, wide 1.6ms. Regression threshold is labs
// minDelta 5%.

import { queryKeys } from "../../src/lib/query/keys.utils";

function buildMix(i: number): readonly unknown[] {
  switch (i % 8) {
    case 0: {
      return queryKeys.animeFull(i, "proxy", i % 2 === 0);
    }
    case 1: {
      return queryKeys.torrentSearch(
        "rutracker",
        `frieren ${i}`,
        i,
        i % 5,
        "seeders",
        "desc",
        undefined
      );
    }
    case 2: {
      return queryKeys.animeShowcase(i, i * 2, "proxy");
    }
    case 3: {
      return queryKeys.activity([i, i + 1, i + 2]);
    }
    case 4: {
      return queryKeys.upscaleEstimate(`/video/ep ${i}.mkv`, ["rife", "4k"]);
    }
    case 5: {
      return queryKeys.animeInlineSearch(`query ${i}`, i % 2 === 0);
    }
    case 6: {
      return queryKeys.tmdbMedia(i, "tv", i % 2 === 0, "proxy");
    }
    default: {
      return queryKeys.torrentFiles(i);
    }
  }
}

group("query-keys @query @quick", () => {
  bench("build 2k mixed keys", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += buildMix(i).length;
    return sum;
  });

  bench("build + stringify 2k mixed keys", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += JSON.stringify(buildMix(i)).length;
    return sum;
  });

  bench("build + stringify wide keys (ids array)", () => {
    let sum = 0;
    for (let i = 0; i < 500; i++) {
      const ids = Array.from({ length: 50 }, (_, k) => i * 50 + k);
      sum += JSON.stringify(queryKeys.activity(ids)).length;
    }
    return sum;
  });
});
