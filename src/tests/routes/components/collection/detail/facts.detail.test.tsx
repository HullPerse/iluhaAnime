import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DetailFactsCollection } from "@/routes/components/collection/detail/facts.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

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
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: 2002,
    releaseDate: null,
    genres: [],
    studio: null,
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

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("DetailFactsCollection year", () => {
  it("shows the release year", () => {
    render(<DetailFactsCollection item={makeItem({ year: 2002 })} statuses={[]} statusText="" />);
    expect(screen.getByText(/Year/)).toBeTruthy();
    expect(screen.getByText(/2002/)).toBeTruthy();
  });

  it("shows a dash when the year is missing", () => {
    render(<DetailFactsCollection item={makeItem({ year: null })} statuses={[]} statusText="" />);
    expect(screen.getByText(/Year/)).toBeTruthy();
    expect(screen.getByText(/-/)).toBeTruthy();
  });
});
