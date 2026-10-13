import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionCard } from "@/routes/components/collection/card.collection";
import { GroupHeaderCollection } from "@/routes/components/collection/groupHeader.collection";
import { patchSettings } from "@/store/settings.store";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { color: "#9ca3af", id: "planned", isCore: true, kind: "private", label: "Planned", order: 0 },
  { color: "#3b82f6", id: "watching", isCore: true, kind: "private", label: "Watching", order: 1 },
];

function item(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    addedAt: 0,
    altTitles: [],
    coverBlobId: null,
    coverUrl: null,
    customFields: {},
    description: null,
    detailsJson: null,
    durationMinutes: null,
    externalIds: {},
    finishedAt: null,
    genres: [],
    id: "1",
    isFavorite: false,
    lastWatchedAt: null,
    localKind: null,
    localPath: null,
    notes: null,
    priority: "normal",
    progressTotal: null,
    progressUnit: "episodes",
    progressValue: 0,
    rating: null,
    releaseDate: null,
    rewatchCount: 0,
    sitesToView: [],
    startedAt: null,
    status: "planned",
    studio: null,
    thumbBlobId: null,
    title: "Cowboy Bebop",
    tvCurrentEpisode: null,
    tvCurrentSeason: null,
    type: "anime",
    updatedAt: 0,
    year: 1998,
    ...overrides,
  };
}

function renderCard(props: Partial<Parameters<typeof CollectionCard>[0]> = {}) {
  const onOpen = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <CollectionCard item={item()} statuses={STATUSES} onOpen={onOpen} {...props} />
    </QueryClientProvider>
  );
  return { view, onOpen };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en" });
});

describe("CollectionCard keyboard surface", () => {
  it("opens on Enter and Space from the cover button", () => {
    const { onOpen } = renderCard();

    const cover = screen.getByRole("button", { name: "Cowboy Bebop" });
    expect(cover.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(cover, { key: "Enter" });
    fireEvent.keyDown(cover, { key: " " });
    fireEvent.keyDown(cover, { key: "x" });

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("is not a button when there is nothing to open", () => {
    renderCard({ onOpen: undefined });

    expect(screen.queryByRole("button", { name: "Cowboy Bebop" })).toBeNull();
  });

  it("keeps the status control and the edit action reachable", () => {
    const onEdit = vi.fn();
    const onSetStatus = vi.fn();
    renderCard({ onEdit, onSetStatus });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe("GroupHeaderCollection keyboard surface", () => {
  function renderHeader(collapsed: boolean, onAdd?: () => void) {
    const onToggle = vi.fn();
    const view = render(
      <GroupHeaderCollection
        label="Watching"
        color="#3b82f6"
        count={3}
        collapsed={collapsed}
        variant="folder"
        toggleLabel="Watching"
        onToggle={onToggle}
        {...(onAdd ? { onAdd, addLabel: "Add to Watching" } : {})}
      />
    );
    return { view, onToggle };
  }

  it("hints as a button and reports its expanded state", () => {
    renderHeader(false);

    const header = screen.getByRole("button", { name: /Watching/ });
    expect(header.getAttribute("tabindex")).toBe("0");
    expect(header.getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles on Enter and Space", () => {
    const { onToggle } = renderHeader(true);

    const header = screen.getByRole("button", { name: /Watching/ });
    fireEvent.keyDown(header, { key: "Enter" });
    fireEvent.keyDown(header, { key: " " });

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("does not toggle when the add button is used", () => {
    const onAdd = vi.fn();
    const { onToggle } = renderHeader(false, onAdd);

    fireEvent.click(screen.getByRole("button", { name: "Add to Watching" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
