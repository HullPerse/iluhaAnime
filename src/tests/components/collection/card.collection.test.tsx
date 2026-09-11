import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionCard } from "@/routes/components/collection/card.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: true },
];

function makeItem(): CollectionItem {
  return {
    id: "item_1",
    title: "Naruto",
    altTitles: [],
    type: "anime",
    status: "planned",
    progressValue: 0,
    progressTotal: null,
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
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async () => null);
});

describe("CollectionCard interactions", () => {
  it("opens the detail when the poster is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<CollectionCard item={makeItem()} statuses={STATUSES} onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: "Naruto" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("changes status through the inline select", async () => {
    const user = userEvent.setup();
    const onSetStatus = vi.fn();
    render(<CollectionCard item={makeItem()} statuses={STATUSES} onSetStatus={onSetStatus} />);
    const select = screen.getByLabelText("Change status") as HTMLSelectElement;
    await user.selectOptions(select, "watching");
    expect(onSetStatus).toHaveBeenCalledTimes(1);
    expect(onSetStatus.mock.calls[0][1]).toBe("watching");
  });

  it("renders a static status chip without callbacks", () => {
    render(<CollectionCard item={makeItem()} statuses={STATUSES} />);
    expect(screen.queryByRole("button", { name: "Naruto" })).toBeNull();
    expect(screen.getByText("Planned")).toBeTruthy();
  });

  it("marks the selected card with an outline", () => {
    const { container, rerender } = render(
      <CollectionCard item={makeItem()} statuses={STATUSES} onOpen={() => {}} />
    );
    const root = () => (container.firstChild as HTMLElement).className;
    expect(root().includes("outline-2")).toBe(false);
    rerender(<CollectionCard item={makeItem()} statuses={STATUSES} selected onOpen={() => {}} />);
    expect(root().includes("outline-2")).toBe(true);
  });
});
