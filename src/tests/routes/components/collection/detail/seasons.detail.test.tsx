import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SeasonsCollection } from "@/routes/components/collection/detail/seasons.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item_1",
    title: "Frieren",
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 3,
    progressTotal: 28,
    progressUnit: "episodes",
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: 2023,
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
    tvCurrentSeason: 1,
    tvCurrentEpisode: 3,
    detailsJson: null,
    ...overrides,
  };
}
const SEASONS = {
  seasons: [
    { seasonNumber: 1, episodeCount: 28, name: "" },
    { seasonNumber: 2, episodeCount: 12, name: "Golden Land" },
  ],
};

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("SeasonsCollection", () => {
  it("renders nothing without stored seasons", () => {
    render(<SeasonsCollection item={makeItem()} />);
    expect(screen.queryByLabelText("Seasons")).toBeNull();
  });

  it("expands to season rows", async () => {
    const user = userEvent.setup();
    render(<SeasonsCollection item={makeItem({ detailsJson: SEASONS })} />);

    await user.click(screen.getByRole("button", { name: "Expand section" }));

    expect(screen.getByText("Golden Land", { exact: false })).toBeTruthy();
    expect(screen.getByText("28", { exact: false })).toBeTruthy();
  });
});
