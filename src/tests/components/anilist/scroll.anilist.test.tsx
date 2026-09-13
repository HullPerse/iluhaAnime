import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { groupEntriesByList } from "@/lib/anilist/group.utils";
import AniListScrollView from "@/routes/components/anilist/scroll.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListCollection, AniListEntry, AniMedia } from "@/types/anilist";

function makeMedia(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    cover_url: null,
    description: null,
    duration: 23,
    end_date: null,
    episodes: 12,
    favourites: 0,
    format: "TV",
    genres: [],
    id: 1,
    next_airing_at: null,
    next_episode: null,
    popularity: 0,
    rankings: [],
    relations: [],
    score: 8,
    season: null,
    season_year: null,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "Title",
    titles: [],
    ...overrides,
  };
}

function makeEntry(mediaId: number, title: string): AniListEntry {
  return {
    completed_at: null,
    started_at: null,
    created_at: 0,
    list_status: "CURRENT",
    media: makeMedia({ id: mediaId, title }),
    progress: null,
    score: null,
    updated_at: 0,
  };
}

function makeList(name: string, ids: number[]): AniListCollection {
  return { name, entries: ids.map((id) => makeEntry(id, `Anime ${id}`)) };
}

const LISTS = [makeList("Current", [1, 2]), makeList("Planning", [3])];
const LOOKUP = buildEntryLookup(LISTS);

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
        const blockSize = isHeader ? 24 : 144;
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

describe("AniListScrollView", () => {
  it("renders every card without groups", () => {
    render(
      <AniListScrollView
        items={[makeMedia({ id: 1, title: "Naruto" }), makeMedia({ id: 2, title: "Bleach" })]}
        entryLookup={LOOKUP}
        favouriteIds={new Set()}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Naruto")).not.toBeNull();
    expect(screen.getByText("Bleach")).not.toBeNull();
  });

  it("renders a group header above its cards", () => {
    const flat = LISTS.flatMap((list) => list.entries);
    render(
      <AniListScrollView
        items={[]}
        entryLookup={LOOKUP}
        favouriteIds={new Set()}
        onSelect={() => {}}
        groups={groupEntriesByList(flat, LISTS)}
      />
    );
    expect(screen.getByRole("button", { name: /watching/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /planning/i })).not.toBeNull();
    expect(screen.getByText("Anime 1")).not.toBeNull();
    expect(screen.getByText("Anime 3")).not.toBeNull();
  });

  it("hides items of a collapsed group but keeps its header", () => {
    const flat = LISTS.flatMap((list) => list.entries);
    render(
      <AniListScrollView
        items={[]}
        entryLookup={LOOKUP}
        favouriteIds={new Set()}
        onSelect={() => {}}
        groups={groupEntriesByList(flat, LISTS)}
        collapsedLists={new Set(["Current"])}
      />
    );
    expect(screen.getByRole("button", { name: /watching/i })).not.toBeNull();
    expect(screen.queryByText("Anime 1")).toBeNull();
    expect(screen.getByText("Anime 3")).not.toBeNull();
  });

  it("opens the detail when a card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AniListScrollView
        items={[makeMedia({ id: 1, title: "Naruto" })]}
        entryLookup={LOOKUP}
        favouriteIds={new Set()}
        onSelect={onSelect}
      />
    );
    await user.click(screen.getByRole("button", { name: "Naruto" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ animeId: 1 });
  });
});
