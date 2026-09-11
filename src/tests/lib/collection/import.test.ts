import { describe, expect, it } from "vitest";

import {
  buildAnilistPrefill,
  entryDiffers,
  entrySyncState,
  entryToWizardValues,
  mediaToWizardValues,
} from "@/lib/collection/import.utils";
import type { AniListEntry } from "@/types/anilist";
import type { CollectionItem, QuickAddListEntry, QuickAddMedia } from "@/types/collection";

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

describe("entryToWizardValues", () => {
  it("merges anilist tags into genres without duplicates", () => {
    const base = makeEntry();
    const values = entryToWizardValues({
      ...base,
      media: { ...base.media, genres: ["Action"], tags: ["School", "Action"] },
    });
    expect(values.genres).toBe("Action, School");
  });
});

describe("mediaToWizardValues", () => {
  const media: QuickAddMedia = {
    id: 21,
    title: "Frieren",
    titles: ["Sousou no Frieren"],
    episodes: 28,
    duration: 24,
    score: 91,
    genres: ["Adventure"],
    tags: ["Male Protagonist", "adventure"],
    description: "An elven mage journey",
    cover_url: "https://example.com/f.jpg",
    season_year: 2023,
    start_date: null,
    format: "TV",
    studios: [{ id: 1, name: "Madhouse" }],
  };
  const entry: QuickAddListEntry = { progress: 5, score: 8, list_status: "CURRENT" };

  it("takes status, progress, score and favorite from the anilist state", () => {
    const values = mediaToWizardValues(media, entry, true);
    expect(values.status).toBe("watching");
    expect(values.progressValue).toBe("5");
    expect(values.rating).toBe("8");
    expect(values.isFavorite).toBe(true);
    expect(values.externalIds).toEqual({ anilist: 21 });
  });

  it("merges tags into genres and fills media fields", () => {
    const values = mediaToWizardValues(media, entry, false);
    expect(values.genres).toBe("Adventure, Male Protagonist");
    expect(values.studio).toBe("Madhouse");
    expect(values.year).toBe("2023");
    expect(values.description).toBe("An elven mage journey");
    expect(values.progressTotal).toBe("28");
  });

  it("falls back to planned, zero progress and media score without a list entry", () => {
    const values = mediaToWizardValues(media, undefined, false);
    expect(values.status).toBe("planned");
    expect(values.progressValue).toBe("0");
    expect(values.rating).toBe("9");
    expect(values.isFavorite).toBe(false);
  });

  it("leaves rating empty when neither entry nor media has a score", () => {
    const values = mediaToWizardValues({ ...media, score: null }, undefined, false);
    expect(values.rating).toBe("");
  });

  it("maps release date, mal id, and movie format", () => {
    const values = mediaToWizardValues(
      { ...media, start_date: "2023-09-29", id_mal: 52991, format: "MOVIE" },
      undefined,
      false
    );
    expect(values.releaseDate).toBe("2023-09-29");
    expect(values.externalIds).toEqual({ anilist: 21, mal: 52991 });
    expect(values.type).toBe("movie");
  });
});
