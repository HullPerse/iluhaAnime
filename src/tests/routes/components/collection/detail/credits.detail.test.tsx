import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CreditsCollection } from "@/routes/components/collection/detail/credits.detail";
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
    tvCurrentSeason: null,
    tvCurrentEpisode: null,
    detailsJson: null,
    ...overrides,
  };
}
const CREDITS = {
  staff: [{ id: 1, name: "Keiichiro Saito", role: "Director" }],
  characters: [{ id: 2, name: "Frieren", voiceActors: [{ id: 3, name: "Atsumi Tanezaki" }] }],
};

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("CreditsCollection", () => {
  it("renders nothing without stored credits", () => {
    render(<CreditsCollection item={makeItem()} />);
    expect(screen.queryByLabelText("Credits")).toBeNull();
  });

  it("expands to staff and character rows", async () => {
    const user = userEvent.setup();
    render(<CreditsCollection item={makeItem({ detailsJson: CREDITS })} />);

    await user.click(screen.getByRole("button", { name: "Expand section" }));

    expect(screen.getByText("Keiichiro Saito")).toBeTruthy();
    expect(screen.getByText("Director")).toBeTruthy();
    expect(screen.getByText("Atsumi Tanezaki")).toBeTruthy();
  });
});
