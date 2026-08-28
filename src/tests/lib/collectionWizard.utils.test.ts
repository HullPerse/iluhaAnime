import { describe, expect, it } from "vitest";

import {
  buildWizardItem,
  resolveFinishedAt,
  wizardDefaultsDates,
  wizardDefaultsIdentity,
  wizardDefaultsMedia,
  wizardDefaultsMeta,
  wizardDefaultsProgress,
  type WizardSaveValues,
} from "@/lib/collectionWizard.utils";
import type { CollectionItem } from "@/types/collection";

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item_1",
    title: "Naruto",
    altTitles: ["Naruto (JP)"],
    type: "anime",
    status: "watching",
    progressValue: 12,
    progressTotal: 220,
    progressUnit: "episodes",
    durationMinutes: 23,
    rating: 8,
    priority: "normal",
    isFavorite: true,
    year: 2002,
    genres: ["Action", "Adventure"],
    studio: "Pierrot",
    description: "A ninja story.",
    notes: "Rewatch later.",
    coverUrl: "https://example.com/cover.jpg",
    coverBlobId: "blob_1",
    thumbBlobId: "blob_1",
    externalIds: { anilist: 20 },
    customFields: { mood: "epic" },
    localPath: "C:\\Anime\\Naruto",
    localKind: "folder",
    startedAt: Date.UTC(2024, 0, 15),
    finishedAt: null,
    lastWatchedAt: Date.UTC(2024, 1, 1),
    rewatchCount: 2,
    addedAt: Date.UTC(2024, 0, 1),
    updatedAt: Date.UTC(2024, 0, 1),
    ...overrides,
  };
}

function makeValues(overrides: Partial<WizardSaveValues> = {}): WizardSaveValues {
  return {
    title: "  Naruto  ",
    altTitles: "Naruto (JP), , Shippuden",
    type: "anime",
    status: "watching",
    progressValue: "12",
    progressTotal: "220",
    progressUnit: "episodes",
    durationMinutes: "23",
    rating: "8",
    priority: "normal",
    isFavorite: true,
    year: "2002",
    genres: "Action, Drama, ",
    studio: "  Pierrot  ",
    description: "  A ninja story.  ",
    notes: "  Rewatch later.  ",
    coverUrl: "https://example.com/cover.jpg",
    externalIds: { anilist: 20 },
    customFields: { mood: "epic" },
    localPath: "C:\\Anime\\Naruto",
    localKind: "folder",
    startedAt: "2024-01-15",
    finishedAt: "",
    ...overrides,
  };
}

describe("buildWizardItem", () => {
  it("trims text fields and splits comma lists, dropping empties", () => {
    const item = buildWizardItem(makeValues(), "blob_9", null);
    expect(item.title).toBe("Naruto");
    expect(item.altTitles).toEqual(["Naruto (JP)", "Shippuden"]);
    expect(item.genres).toEqual(["Action", "Drama"]);
    expect(item.studio).toBe("Pierrot");
    expect(item.description).toBe("A ninja story.");
    expect(item.notes).toBe("Rewatch later.");
  });

  it("clamps progress, total, duration, and rating to their bounds", () => {
    const item = buildWizardItem(
      makeValues({
        progressValue: "-5",
        progressTotal: "0",
        durationMinutes: "-3",
        rating: "11",
      }),
      null,
      null
    );
    expect(item.progressValue).toBe(0);
    expect(item.progressTotal).toBe(1);
    expect(item.durationMinutes).toBe(0);
    expect(item.rating).toBe(10);

    const low = buildWizardItem(makeValues({ rating: "0" }), null, null);
    expect(low.rating).toBe(1);
  });

  it("turns empty optional numbers into null", () => {
    const item = buildWizardItem(
      makeValues({
        progressTotal: "",
        durationMinutes: "",
        rating: "",
        year: "",
      }),
      null,
      null
    );
    expect(item.progressTotal).toBeNull();
    expect(item.durationMinutes).toBeNull();
    expect(item.rating).toBeNull();
    expect(item.year).toBeNull();
  });

  it("passes the cover blob id to both cover and thumb fields", () => {
    const item = buildWizardItem(makeValues(), "blob_9", null);
    expect(item.coverBlobId).toBe("blob_9");
    expect(item.thumbBlobId).toBe("blob_9");
  });

  it("converts dates to timestamps and keeps empty dates null", () => {
    const item = buildWizardItem(makeValues(), null, null);
    expect(item.startedAt).toBe(new Date("2024-01-15").getTime());
    expect(item.finishedAt).toBeNull();
  });

  it("resolves finishedAt to now for completed items without a date", () => {
    const before = Date.now();
    const item = buildWizardItem(makeValues({ status: "completed" }), null, null);
    expect(item.finishedAt).not.toBeNull();
    expect(item.finishedAt!).toBeGreaterThanOrEqual(before);
    expect(item.finishedAt!).toBeLessThanOrEqual(Date.now());
  });

  it("preserves rewatch and last-watched state from the initial item", () => {
    const initial = makeItem();
    const item = buildWizardItem(makeValues(), null, initial);
    expect(item.lastWatchedAt).toBe(initial.lastWatchedAt);
    expect(item.rewatchCount).toBe(2);
  });

  it("defaults rewatch state for new items", () => {
    const item = buildWizardItem(makeValues(), null, null);
    expect(item.lastWatchedAt).toBeNull();
    expect(item.rewatchCount).toBe(0);
  });

  it("keeps external ids and custom fields as-is", () => {
    const item = buildWizardItem(makeValues(), null, null);
    expect(item.externalIds).toEqual({ anilist: 20 });
    expect(item.customFields).toEqual({ mood: "epic" });
  });
});

describe("resolveFinishedAt", () => {
  it("returns the parsed timestamp for an explicit date", () => {
    expect(resolveFinishedAt("planned", "2024-05-01")).toBe(
      new Date("2024-05-01").getTime()
    );
  });

  it("returns null for non-completed statuses without a date", () => {
    expect(resolveFinishedAt("watching", "")).toBeNull();
  });

  it("returns now for completed statuses without a date", () => {
    const before = Date.now();
    const result = resolveFinishedAt("completed", "");
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(before);
    expect(result!).toBeLessThanOrEqual(Date.now());
  });
});

describe("wizardDefaultsIdentity", () => {
  it("returns defaults for a new item", () => {
    expect(wizardDefaultsIdentity(null)).toEqual({
      title: "",
      altTitles: "",
      type: "anime",
      status: "planned",
    });
  });

  it("joins alt titles and keeps the item values", () => {
    expect(wizardDefaultsIdentity(makeItem())).toEqual({
      title: "Naruto",
      altTitles: "Naruto (JP)",
      type: "anime",
      status: "watching",
    });
  });
});

describe("wizardDefaultsProgress", () => {
  it("returns defaults for a new item", () => {
    expect(wizardDefaultsProgress(null)).toEqual({
      progressValue: "0",
      progressTotal: "",
      progressUnit: "episodes",
      rating: "",
      priority: "normal",
      isFavorite: false,
    });
  });

  it("stringifies the item values", () => {
    expect(wizardDefaultsProgress(makeItem())).toEqual({
      progressValue: "12",
      progressTotal: "220",
      progressUnit: "episodes",
      rating: "8",
      priority: "normal",
      isFavorite: true,
    });
  });
});

describe("wizardDefaultsMeta", () => {
  it("returns defaults for a new item", () => {
    expect(wizardDefaultsMeta(null)).toEqual({
      year: "",
      description: "",
      durationMinutes: "",
      genres: "",
      studio: "",
    });
  });

  it("stringifies year and duration, joins genres", () => {
    expect(wizardDefaultsMeta(makeItem())).toEqual({
      year: "2002",
      description: "A ninja story.",
      durationMinutes: "23",
      genres: "Action, Adventure",
      studio: "Pierrot",
    });
  });
});

describe("wizardDefaultsDates", () => {
  it("returns empty strings for a new item", () => {
    expect(wizardDefaultsDates(null)).toEqual({
      startedAt: "",
      finishedAt: "",
      notes: "",
    });
  });

  it("formats timestamps as YYYY-MM-DD", () => {
    const item = makeItem({
      startedAt: Date.UTC(2024, 0, 15),
      finishedAt: Date.UTC(2024, 5, 2),
      notes: "Rewatch later.",
    });
    expect(wizardDefaultsDates(item)).toEqual({
      startedAt: "2024-01-15",
      finishedAt: "2024-06-02",
      notes: "Rewatch later.",
    });
  });
});

describe("wizardDefaultsMedia", () => {
  it("returns defaults for a new item", () => {
    expect(wizardDefaultsMedia(null)).toEqual({
      coverUrl: "",
      externalIds: {},
      localPath: "",
      localKind: null,
      customFields: {},
    });
  });

  it("keeps the item values", () => {
    expect(wizardDefaultsMedia(makeItem())).toEqual({
      coverUrl: "https://example.com/cover.jpg",
      externalIds: { anilist: 20 },
      localPath: "C:\\Anime\\Naruto",
      localKind: "folder",
      customFields: { mood: "epic" },
    });
  });
});