import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groupItemsByStatus } from "@/lib/collection/group.utils";
import ListCollection from "@/routes/components/collection/list.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "watching", label: "Watching", color: "#3b82f6", order: 0, isCore: true },
  { id: "completed", label: "Completed", color: "#22c55e", order: 1, isCore: true },
];

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "1",
    title: "Frieren",
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 3,
    progressTotal: 28,
    progressUnit: "episodes",
    durationMinutes: 24,
    rating: 9,
    priority: "normal",
    isFavorite: false,
    year: 2023,
    genres: ["Adventure", "Fantasy"],
    studio: "Madhouse",
    description: null,
    notes: null,
    coverUrl: "data:image/png;base64,cover",
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

const ITEMS = [
  makeItem({ id: "1", title: "Frieren" }),
  makeItem({
    id: "2",
    title: "Sousou",
    status: "completed",
    rating: null,
    progressValue: 0,
    progressTotal: null,
  }),
];

function stubResizeObserver() {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        const isHeader = target.firstElementChild?.getAttribute("role") === "button";
        const blockSize = isHeader ? 24 : 120;
        this.callback(
          [
            {
              target,
              borderBoxSize: [{ inlineSize: 800, blockSize }],
              contentRect: { width: 800, height: blockSize },
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver
        );
      }
      unobserve() {}
      disconnect() {}
    },
  });
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  stubResizeObserver();
});

afterEach(() => {
  cleanup();
});

describe("ListCollection", () => {
  it("renders anilist-style rows with title, status, rating and progress", () => {
    render(<ListCollection items={ITEMS} statuses={STATUSES} />);
    expect(screen.getByTitle("Frieren")).not.toBeNull();
    expect(screen.getByText("Watching")).not.toBeNull();
    expect(screen.getByText("9")).not.toBeNull();
    expect(screen.getByText("3/28")).not.toBeNull();
    expect(screen.getByTitle("Sousou")).not.toBeNull();
    const covers = screen.getAllByAltText(/cover$/);
    expect(covers.length).toBeGreaterThan(0);
    for (const cover of covers) expect(cover.getAttribute("loading")).toBe("eager");
  });

  it("keeps the white background with no rows when empty", () => {
    render(<ListCollection items={[]} statuses={STATUSES} />);
    expect(document.querySelector("section")).not.toBeNull();
    expect(screen.queryByTitle("Frieren")).toBeNull();
  });
});

describe("ListCollection grouped", () => {
  it("renders a status group header above its items", () => {
    const groups = groupItemsByStatus(ITEMS, STATUSES);
    render(<ListCollection items={ITEMS} statuses={STATUSES} groups={groups} />);
    expect(screen.getByRole("button", { name: /watching/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /completed/i })).not.toBeNull();
    expect(screen.getByTitle("Frieren")).not.toBeNull();
    expect(screen.getByTitle("Sousou")).not.toBeNull();
  });

  it("hides items of a collapsed group but keeps its header", () => {
    const groups = groupItemsByStatus(ITEMS, STATUSES);
    render(
      <ListCollection
        items={ITEMS}
        statuses={STATUSES}
        groups={groups}
        collapsedStatuses={new Set(["completed"])}
      />
    );
    expect(screen.getByRole("button", { name: /completed/i })).not.toBeNull();
    expect(screen.queryByTitle("Sousou")).toBeNull();
    expect(screen.getByTitle("Frieren")).not.toBeNull();
  });

  it("toggles the collapsed status when the header is clicked", () => {
    const groups = groupItemsByStatus(ITEMS, STATUSES);
    const onToggle = vi.fn();
    render(
      <ListCollection
        items={ITEMS}
        statuses={STATUSES}
        groups={groups}
        onToggleStatusCollapsed={onToggle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /watching/i }));
    expect(onToggle).toHaveBeenCalledWith("watching");
  });
});
