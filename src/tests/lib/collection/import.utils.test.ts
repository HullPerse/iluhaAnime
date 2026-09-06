import { describe, expect, it } from "vitest";

import { buildAnilistPrefill, entryDiffers, entrySyncState } from "@/lib/collection/import.utils";
import type { AniListEntry } from "@/types/anilist";
import type { CollectionItem } from "@/types/collection";

function makeEntry(overrides: Partial<AniListEntry> = {}): AniListEntry {
  return {
    media: {
      id: 1,
      title: "Test Anime",
      titles: ["Test Anime"],
      episodes: 12,
      duration: 24,
      format: "TV",
      status: "FINISHED",
      score: 80,
      genres: ["Action"],
      tags: [],
      description: null,
      cover_url: "https://example.com/cover.jpg",
      season: null,
      season_year: 2024,
      studios: [{ id: 1, name: "Studio X" }],
      next_episode: null,
      next_airing_at: null,
      start_date: null,
      end_date: null,
      popularity: 0,
      favourites: 0,
      rankings: [],
      relations: [],
    },
    progress: 5,
    score: 80,
    list_status: "CURRENT",
    created_at: null,
    completed_at: null,
    updated_at: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item_1",
    title: "Test Anime",
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 5,
    progressTotal: 12,
    progressUnit: "episodes",
    rating: 10,
    externalIds: { anilist: 1 },
    ...overrides,
  } as unknown as CollectionItem;
}

describe("entrySyncState", () => {
  it("maps list status, progress and score like the import would", () => {
    expect(entrySyncState(makeEntry())).toEqual({
      status: "watching",
      progressValue: 5,
      rating: 10,
    });
  });

  it("falls back to media score when the entry has no score", () => {
    const entry = makeEntry({ score: null });
    expect(entrySyncState(entry).rating).toBe(8);
  });

  it("defaults missing progress to zero", () => {
    expect(entrySyncState(makeEntry({ progress: null })).progressValue).toBe(0);
  });
});

describe("entryDiffers", () => {
  it("returns false when the collection item matches the entry state", () => {
    const entry = makeEntry();
    const item = makeItem({ status: "watching", progressValue: 5, rating: 10 });
    expect(entryDiffers(entry, item)).toBe(false);
  });

  it("returns true when status differs", () => {
    const entry = makeEntry({ list_status: "COMPLETED" });
    const item = makeItem({ status: "watching", progressValue: 5, rating: 10 });
    expect(entryDiffers(entry, item)).toBe(true);
  });

  it("returns true when progress differs", () => {
    const entry = makeEntry({ progress: 9 });
    const item = makeItem({ status: "watching", progressValue: 5, rating: 10 });
    expect(entryDiffers(entry, item)).toBe(true);
  });

  it("returns true when rating differs", () => {
    const entry = makeEntry({ score: 70 });
    const item = makeItem({ status: "watching", progressValue: 5, rating: 7 });
    expect(entryDiffers(entry, item)).toBe(true);
  });
});
describe("buildAnilistPrefill", () => {
  const media = { title: "Frieren", cover_url: "https://example.com/f.jpg" };
  it("maps current status to watching with cover", () => {
    expect(buildAnilistPrefill(media, "CURRENT")).toEqual({
      title: "Frieren",
      coverUrl: "https://example.com/f.jpg",
      status: "watching",
    });
  });
  it("defaults missing profile to planned", () => {
    expect(buildAnilistPrefill({ title: "X", cover_url: null }, null).status).toBe("planned");
  });
  it("maps completed and dropped", () => {
    expect(buildAnilistPrefill(media, "COMPLETED").status).toBe("completed");
    expect(buildAnilistPrefill(media, "DROPPED").status).toBe("dropped");
  });
});
