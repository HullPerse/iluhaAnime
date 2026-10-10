import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS } from "@/config/collection/filters.config";
import { filterCollectionItems } from "@/lib/collection/filter.utils";
import { parseMediaPath } from "@/lib/media/parse.utils";
import { getSearchSuggestions } from "@/lib/search/suggestions.utils";
import { buildTorrentTree } from "@/lib/torrent/tree.utils";
import type { CollectionItem } from "@/types/collection";
import type { SearchAnimeSuggestion } from "@/types/search";
import type { TorrentFileInfo } from "@/types/torrent";

const SEEDS = [1, 2, 7, 42, 1337];

function shuffled<T>(items: readonly T[], seed: number): T[] {
  let state = seed * 2654435761;
  const draw = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1));
    const swap = out[j]!;
    out[j] = out[i]!;
    out[i] = swap;
  }
  return out;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
}

const MEDIA_PATHS = [
  "/downloads/anime/[Erai-raws] Sousou no Frieren - 27 [1080p][RUS].mkv",
  "/downloads/anime/[Leopard-Raws] Hunter x Hunter - 148 (2011) [1080p][RUS].mkv",
  "/downloads/movies/Steins;Gate Movie - Load Region of Déjà Vu (2013).mp4",
  "/downloads/anime/Season 2/[SubsPlease] Sousou no Frieren - 01v2 [1080p].mkv",
  "/downloads/anime/Mushishi Special - 02 [DVD].avi",
];

const TORRENT_FILES: TorrentFileInfo[] = [
  {
    completed: true,
    exists: true,
    index: 0,
    name: "Release/a.mkv",
    priority: "normal",
    progress_bytes: 1400,
    selected: true,
    size: 1400,
  },
  {
    completed: true,
    exists: true,
    index: 1,
    name: "Release/z.mkv",
    priority: "normal",
    progress_bytes: 900,
    selected: true,
    size: 900,
  },
  {
    completed: false,
    exists: true,
    index: 2,
    name: "Release/Subtitles/s1.ass",
    priority: "normal",
    progress_bytes: 0,
    selected: false,
    size: 80,
  },
  {
    completed: true,
    exists: true,
    index: 3,
    name: "Release/Nested/Deep/n.mkv",
    priority: "normal",
    progress_bytes: 100,
    selected: true,
    size: 100,
  },
  {
    completed: true,
    exists: true,
    index: 4,
    name: "info.nfo",
    priority: "normal",
    progress_bytes: 2,
    selected: true,
    size: 2,
  },
  {
    completed: true,
    exists: true,
    index: 5,
    name: "Release/Subtitles/s2.ass",
    priority: "normal",
    progress_bytes: 80,
    selected: true,
    size: 80,
  },
];

const ANIME_INDEX: SearchAnimeSuggestion[] = [
  {
    aliases: ["Sousou no Frieren"],
    favourite: true,
    id: 1,
    score: 95,
    status: "COMPLETED",
    title: "Frieren: Beyond Journey's End",
  },
  { aliases: [], favourite: false, id: 2, score: 0, status: "PLANNING", title: "Fruits Basket" },
  {
    aliases: ["Shingeki no Kyojin"],
    favourite: false,
    id: 3,
    score: 87,
    status: "FINISHED",
    title: "Attack on Titan",
  },
  { aliases: [], favourite: false, id: 4, score: 70, status: "RELEASING", title: "Frieren" },
];

function collectionItems(count: number): CollectionItem[] {
  const words = ["Frieren", "Naruto", "Fruits", "Attack", "Titan"];
  const out: CollectionItem[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      addedAt: count - i,
      altTitles: [],
      coverBlobId: null,
      coverUrl: null,
      customFields: {},
      description: null,
      detailsJson: null,
      durationMinutes: 24,
      externalIds: {},
      finishedAt: null,
      genres: ["action"],
      id: `item-${i}`,
      isFavorite: false,
      lastWatchedAt: null,
      localKind: null,
      localPath: null,
      notes: null,
      priority: "normal",
      progressTotal: 24,
      progressUnit: "episodes",
      progressValue: i % 24,
      rating: null,
      releaseDate: null,
      rewatchCount: 0,
      sitesToView: [],
      startedAt: null,
      status: i % 2 === 0 ? "watching" : "completed",
      studio: null,
      thumbBlobId: null,
      title: `${words[i % words.length]} ${i}`,
      tvCurrentEpisode: null,
      tvCurrentSeason: null,
      type: "anime",
      updatedAt: count - i,
      year: 2000 + (i % 20),
    });
  }
  return out;
}

describe("determinism", () => {
  it("parses the same media path identically on every run", () => {
    const first = MEDIA_PATHS.map(parseMediaPath).map(canonicalJson);
    for (let run = 0; run < 20; run++) {
      expect(MEDIA_PATHS.map(parseMediaPath).map(canonicalJson)).toEqual(first);
    }
  });

  it("builds the same torrent tree for any file order", () => {
    const reference = canonicalJson(buildTorrentTree(TORRENT_FILES));
    for (const seed of SEEDS) {
      expect(canonicalJson(buildTorrentTree(shuffled(TORRENT_FILES, seed)))).toBe(reference);
    }
  });

  it("ranks suggestions the same for any index order", () => {
    const reference = canonicalJson(
      getSearchSuggestions("fri", { animeIndex: ANIME_INDEX, limit: 5 })
    );
    for (const seed of SEEDS) {
      const options = { animeIndex: shuffled(ANIME_INDEX, seed), limit: 5 };
      expect(canonicalJson(getSearchSuggestions("fri", options))).toBe(reference);
    }
  });

  it("orders filtered collections canonically for any input order", () => {
    const items = collectionItems(50);
    const run = (seed: number | null): string[] =>
      filterCollectionItems(
        seed === null ? items : shuffled(items, seed),
        items,
        "all",
        "fri",
        DEFAULT_FILTERS,
        "name",
        "asc"
      ).map((item) => item.id);
    const reference = run(null);
    expect(reference).toContain("item-0");
    for (const seed of SEEDS) {
      expect(run(seed)).toEqual(reference);
    }
  });
});
