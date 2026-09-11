import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContinueCollection from "@/routes/components/collection/continue.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item_1",
    title: "Naruto",
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 3,
    progressTotal: 12,
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

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("ContinueCollection", () => {
  it("renders nothing without items", () => {
    render(<ContinueCollection items={[]} onOpen={() => {}} />);
    expect(screen.queryByLabelText("Continue watching")).toBeNull();
  });

  it("opens the detail from a row", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const item = makeItem();
    render(<ContinueCollection items={[item]} onOpen={onOpen} />);

    await user.click(screen.getByTitle("Naruto"));

    expect(onOpen).toHaveBeenCalledWith(item);
  });

});
