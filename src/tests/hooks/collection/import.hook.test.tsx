import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useImportSelection } from "@/hooks/collection/import.hook";
import { buildImportDiff } from "@/lib/core/collection/importDiff.utils";
import type {
  AniListCollection,
  AniListEntry,
  AniMedia,
} from "@/types/anilist/anilist";
import type { CollectionItem } from "@/types/anilist/collection";

const media = (id: number, title: string): AniMedia => ({
  id,
  title,
  titles: [title],
  episodes: 12,
  duration: 24,
  format: "TV",
  status: "FINISHED",
  score: null,
  genres: [],
  tags: [],
  description: null,
  cover_url: null,
  season: null,
  season_year: 2024,
  studios: [],
  next_episode: null,
  next_airing_at: null,
  start_date: null,
  end_date: null,
  popularity: null,
  favourites: null,
  rankings: [],
  relations: [],
});

const entry = (
  id: number,
  title: string,
  overrides: Partial<AniListEntry> = {}
): AniListEntry => ({
  media: media(id, title),
  progress: 0,
  score: null,
  list_status: "CURRENT",
  created_at: null,
  completed_at: null,
  started_at: null,
  updated_at: null,
  notes: null,
  repeat: null,
  custom_lists: [],
  ...overrides,
});

const item = (
  id: string,
  title: string,
  anilistId: number | null,
  overrides: Partial<CollectionItem> = {}
): CollectionItem => ({
  id,
  title,
  altTitles: [],
  type: "anime",
  status: "watching",
  progressValue: 0,
  progressTotal: null,
  progressUnit: "episodes",
  durationMinutes: null,
  rating: null,
  priority: "normal",
  isFavorite: false,
  year: null,
  releaseDate: null,
  genres: [],
  studio: null,
  description: null,
  notes: null,
  coverUrl: null,
  coverBlobId: null,
  thumbBlobId: null,
  externalIds: anilistId === null ? {} : { anilist: anilistId },
  customFields: {},
  localPath: null,
  localKind: null,
  startedAt: null,
  finishedAt: null,
  lastWatchedAt: null,
  rewatchCount: 0,
  addedAt: 0,
  updatedAt: 0,
  sitesToView: [],
  tvCurrentSeason: null,
  tvCurrentEpisode: null,
  detailsJson: null,
  ...overrides,
});

const collection = (name: string, entries: AniListEntry[]): AniListCollection => ({
  name,
  entries,
});

describe("buildImportDiff", () => {
  it("classifies new, matching-id and matching-title entries", () => {
    const lists = [
      collection("Watching", [
        entry(1, "Fresh Show"),
        entry(2, "Known Id"),
        entry(3, "Title Match"),
      ]),
    ];
    const items = [
      item("known-id", "Different Title", 2),
      item("title-match", "  title match  ", null),
    ];

    const diff = buildImportDiff({ lists, items, scoreFormat: "POINT_10" });

    expect(diff.newEntries.map((row) => row.media.id)).toEqual([1]);
    expect(diff.changedEntries).toEqual([]);
    expect(diff.existingCount).toBe(2);
    expect(diff.backfillTargets.map((row) => row.id)).toEqual(["known-id"]);
  });

  it("marks only entries whose status, progress or rating differ", () => {
    const lists = [
      collection("Watching", [
        entry(10, "Changed", { list_status: "COMPLETED", progress: 12, score: 80 }),
        entry(11, "Same", { list_status: "CURRENT", progress: 3, score: null }),
      ]),
    ];
    const items = [
      item("changed", "Changed", 10, { status: "watching", progressValue: 5, rating: 8 }),
      item("same", "Same", 11, { status: "watching", progressValue: 3, rating: null }),
    ];

    const diff = buildImportDiff({ lists, items, scoreFormat: "POINT_100" });

    expect(diff.changedEntries.map((row) => row.media.id)).toEqual([10]);
    expect(diff.newEntries).toEqual([]);
    expect(diff.existingCount).toBe(2);
  });

  it("keeps title matching case-insensitive and trims collection titles", () => {
    const lists = [collection("Planning", [entry(20, "Mixed Case")])];
    const items = [item("mixed", "  mixed CASE  ", null)];

    const diff = buildImportDiff({ lists, items, scoreFormat: "POINT_10" });

    expect(diff.newEntries).toEqual([]);
    expect(diff.existingTitles.has("mixed case")).toBe(true);
  });
});

describe("useImportSelection", () => {
  const first = entry(1, "First");
  const second = entry(2, "Second");

  it("toggles one row and the whole page", () => {
    const { result } = renderHook(() =>
      useImportSelection({ newEntries: [first, second], changedEntries: [] })
    );

    act(() => result.current.toggleOne(1));
    act(() => result.current.toggleAll([first, second]));

    expect([...result.current.selected].sort()).toEqual([1, 2]);
    expect(result.current.selectedNew).toBe(2);

    act(() => result.current.toggleAll([first, second]));

    expect(result.current.selected.size).toBe(0);
    expect(result.current.selectedNew).toBe(0);
  });

  it("reports whether every changed entry is selected and resets", () => {
    const { result } = renderHook(() =>
      useImportSelection({ newEntries: [], changedEntries: [first, second] })
    );

    act(() => result.current.toggleAll([first, second]));

    expect(result.current.allChangedSelected).toBe(true);
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.resetSelection());

    expect(result.current.allChangedSelected).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });
});
