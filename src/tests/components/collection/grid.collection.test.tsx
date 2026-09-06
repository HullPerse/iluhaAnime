import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { groupItemsByStatus } from "@/lib/collection/group.utils";
import GridCollection from "@/routes/components/collection/grid.collection";
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
  makeItem({ id: "2", title: "Sousou", status: "completed", rating: null, year: 2024 }),
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

describe("GridCollection", () => {
  it("renders cards with title, year, rating and status in scroll mode", () => {
    render(<GridCollection items={ITEMS} statuses={STATUSES} display="scroll" />);
    expect(screen.getByTitle("Frieren")).not.toBeNull();
    expect(screen.getByText("9/10")).not.toBeNull();
    expect(screen.getAllByText("Watching").length).toBeGreaterThan(0);
    expect(screen.getByText("2023")).not.toBeNull();
    for (const title of ["Frieren", "Sousou"]) {
      expect(screen.getByAltText(title).getAttribute("loading")).toBe("eager");
    }
  });

  it("renders paged cards with pagination controls", () => {
    render(<GridCollection items={ITEMS} statuses={STATUSES} display="pagination" />);
    expect(screen.getByTitle("Sousou")).not.toBeNull();
    expect(screen.getByLabelText("Next page")).not.toBeNull();
  });

  it("keeps the white background with no cards when empty", () => {
    render(<GridCollection items={[]} statuses={STATUSES} display="scroll" />);
    expect(document.querySelector("section")).not.toBeNull();
    expect(screen.queryByTitle("Frieren")).toBeNull();
  });
});

describe("GridCollection grouped", () => {
  it("renders a status group header above its cards in scroll mode", () => {
    const groups = groupItemsByStatus(ITEMS, STATUSES);
    render(<GridCollection items={ITEMS} statuses={STATUSES} display="scroll" groups={groups} />);
    expect(screen.getByRole("button", { name: /watching/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /completed/i })).not.toBeNull();
    expect(screen.getByTitle("Frieren")).not.toBeNull();
    expect(screen.getByTitle("Sousou")).not.toBeNull();
  });

  it("forces scroll view when grouped even with pagination display", () => {
    const groups = groupItemsByStatus(ITEMS, STATUSES);
    render(
      <GridCollection items={ITEMS} statuses={STATUSES} display="pagination" groups={groups} />
    );
    expect(screen.getByRole("button", { name: /watching/i })).not.toBeNull();
    expect(screen.queryByLabelText("Next page")).toBeNull();
  });

  it("hides cards of a collapsed group but keeps its header", () => {
    const groups = groupItemsByStatus(ITEMS, STATUSES);
    render(
      <GridCollection
        items={ITEMS}
        statuses={STATUSES}
        display="scroll"
        groups={groups}
        collapsedStatuses={new Set(["completed"])}
      />
    );
    expect(screen.getByRole("button", { name: /completed/i })).not.toBeNull();
    expect(screen.queryByTitle("Sousou")).toBeNull();
    expect(screen.getByTitle("Frieren")).not.toBeNull();
  });
});
