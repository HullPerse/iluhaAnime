import { bench, group } from "@pmndrs/labs";

import { collectAllEntries, groupEntriesByListCached } from "@/lib/anilistGroup.utils";
import type { AniListCollection, AniListEntry } from "../../src/types/anilist";

const STATUSES = ["COMPLETED", "CURRENT", "PLANNING", "DROPPED", "PAUSED", "REPEATING"];

function entry(id: number): AniListEntry {
  return {
    media: {
      id,
      title: `Title ${id}`,
      cover_url: null,
      genres: ["Drama"],
      studios: [],
    } as unknown as AniListEntry["media"],
    progress: id % 24,
    score: 70 + (id % 30),
    list_status: STATUSES[id % STATUSES.length]!,
    created_at: null,
    completed_at: null,
    started_at: null,
    updated_at: null,
    notes: null,
    repeat: 0,
    custom_lists: [],
  };
}

const LISTS: AniListCollection[] = [
  { name: "Watching", entries: Array.from({ length: 1500 }, (_, i) => entry(i + 1)) },
  { name: "Completed", entries: Array.from({ length: 1500 }, (_, i) => entry(i + 1501)) },
  { name: "Custom", entries: Array.from({ length: 300 }, (_, i) => entry(i + 1)) },
];

group("anilist group @anilist @quick", () => {
  bench("collectAllEntries dedupe 3000 entries x200", () => {
    let sum = 0;
    for (let index = 0; index < 200; index++) {
      sum += collectAllEntries(LISTS).length;
    }
    return sum;
  });

  bench("groupEntriesByList 3000 entries x200", () => {
    let sum = 0;
    for (let index = 0; index < 200; index++) {
      const groups = groupEntriesByListCached(collectAllEntries(LISTS), LISTS);
      sum += groups.reduce((acc, g) => acc + g.entries.length, 0);
    }
    return sum;
  });
});
