import { describe, expect, it } from "vitest";

import { groupItemsByStatus } from "@/lib/collection/group.utils";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: true },
  { id: "completed", label: "Completed", color: "#22c55e", order: 2, isCore: true },
];

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item_1",
    title: "Naruto",
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 12,
    progressTotal: 220,
    progressUnit: "episodes",
    durationMinutes: 23,
    rating: 8,
    priority: "normal",
    isFavorite: false,
    year: 2002,
    releaseDate: null,
    genres: ["Action"],
    studio: "Pierrot",
    description: null,
    notes: null,
    coverUrl: null,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: {},
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
  };
}

describe("groupItemsByStatus", () => {
  it("returns an empty array for an empty library", () => {
    expect(groupItemsByStatus([], STATUSES)).toEqual([]);
  });

  it("groups items by status in status-definition order", () => {
    const groups = groupItemsByStatus(
      [
        makeItem({ id: "a", status: "completed" }),
        makeItem({ id: "b", status: "watching" }),
        makeItem({ id: "c", status: "completed" }),
        makeItem({ id: "d", status: "planned" }),
      ],
      STATUSES
    );
    expect(groups.map((g) => g.status.id)).toEqual(["planned", "watching", "completed"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["d"], ["b"], ["a", "c"]]);
  });

  it("skips statuses without items", () => {
    const groups = groupItemsByStatus([makeItem({ status: "watching" })], STATUSES);
    expect(groups.map((g) => g.status.id)).toEqual(["watching"]);
  });

  it("preserves item order inside a group", () => {
    const groups = groupItemsByStatus(
      [
        makeItem({ id: "a", status: "watching" }),
        makeItem({ id: "b", status: "watching" }),
        makeItem({ id: "c", status: "watching" }),
      ],
      STATUSES
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by status order even when definitions arrive unsorted", () => {
    const unsorted = [...STATUSES].sort((a, b) => b.order - a.order);
    const groups = groupItemsByStatus(
      [makeItem({ id: "a", status: "completed" }), makeItem({ id: "b", status: "planned" })],
      unsorted
    );
    expect(groups.map((g) => g.status.id)).toEqual(["planned", "completed"]);
  });

  it("appends items with unknown statuses in a synthetic group at the end", () => {
    const groups = groupItemsByStatus(
      [
        makeItem({ id: "a", status: "watching" }),
        makeItem({ id: "b", status: "custom_gone" }),
        makeItem({ id: "c", status: "custom_gone" }),
      ],
      STATUSES
    );
    expect(groups.map((g) => g.status.id)).toEqual(["watching", "custom_gone"]);
    const last = groups.at(-1)!;
    expect(last.status.label).toBe("custom_gone");
    expect(last.status.isCore).toBe(false);
    expect(last.items.map((i) => i.id)).toEqual(["b", "c"]);
  });
});
