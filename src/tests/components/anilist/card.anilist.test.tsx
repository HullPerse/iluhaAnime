import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AniListEntryCard from "@/routes/components/anilist/card.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "2 years ago"),
}));

afterEach(() => cleanup());

function makeItem(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    cover_url: null,
    description: null,
    duration: null,
    end_date: null,
    episodes: 12,
    favourites: null,
    format: "TV",
    genres: [],
    id: 21,
    next_airing_at: null,
    next_episode: null,
    popularity: null,
    rankings: [],
    relations: [],
    score: 80,
    season: null,
    season_year: null,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "One Piece",
    titles: [],
    ...overrides,
  };
}

function lookup(score: number | null) {
  return new Map([
    [
      21,
      {
        list_status: "CURRENT",
        progress: 5,
        score,
        created_at: 1700000000,
        updated_at: 1700000001,
        completed_at: null,
        started_at: null,
      },
    ],
  ]);
}

describe("AniListEntryCard user score", () => {
  const renderCard = (score: number | null, isFavorite = false) =>
    render(
      <AniListEntryCard
        item={makeItem()}
        entryLookup={lookup(score)}
        isFavorite={isFavorite}
        onClick={() => {}}
      />
    );

  it("shows the user score badge when the entry score is non-zero", () => {
    renderCard(8);
    expect(screen.getByTitle(/My score|Моя оценка/).textContent).toContain("8");
  });
  it("hides the user score badge when the entry score is zero", () => {
    renderCard(0);
    expect(screen.queryByTitle(/My score|Моя оценка/)).toBeNull();
  });

  it("hides the user score badge without a list entry", () => {
    render(
      <AniListEntryCard
        item={makeItem()}
        entryLookup={new Map()}
        isFavorite={false}
        onClick={() => {}}
      />
    );
    expect(screen.queryByTitle(/My score|Моя оценка/)).toBeNull();
  });

  it("shows a filled heart for favourite anime", () => {
    renderCard(0, true);
    const heart = screen.getByTitle(/favourites|избранном/);
    expect(heart.className).toContain("h-4");
    expect(heart.className).toContain("w-4");
  });

  it("hides the heart for non-favourite anime", () => {
    renderCard(0, false);
    expect(screen.queryByTitle(/favourites|избранном/)).toBeNull();
  });
});

describe("AniListEntryCard list date", () => {
  it("shows the relative list date with the absolute date as tooltip", () => {
    useSettingsStore.setState({ language: "en" });
    render(
      <AniListEntryCard
        item={makeItem()}
        entryLookup={
          new Map([
            [
              21,
              {
                list_status: "COMPLETED",
                progress: 12,
                score: null,
                created_at: 1700000000,
                updated_at: 1700000001,
                completed_at: "2024-03-09",
                started_at: null,
              },
            ],
          ])
        }
        isFavorite={false}
        onClick={() => {}}
      />
    );
    expect(screen.getByText("2 years ago")).not.toBeNull();
    expect(screen.getByText("2 years ago").getAttribute("title")).toBe("3/9/2024");
  });
});

describe("AniListEntryCard aired count", () => {
  function renderCount(overrides: Partial<AniMedia>) {
    render(
      <AniListEntryCard
        item={makeItem(overrides)}
        entryLookup={new Map()}
        isFavorite={false}
        onClick={() => {}}
      />
    );
  }

  it("shows aired over total next to the progress", () => {
    renderCount({ status: "RELEASING", next_episode: 6, episodes: 12 });
    expect(screen.getByText("5/12")).not.toBeNull();
  });

  it("shows only the aired count when the total is unknown", () => {
    renderCount({ status: "RELEASING", next_episode: 6, episodes: null });
    expect(screen.getByText("5")).not.toBeNull();
  });

  it("hides the count for finished anime and without schedule", () => {
    renderCount({ status: "FINISHED", next_episode: 13, episodes: 12 });
    expect(screen.queryByText("12/12")).toBeNull();
    cleanup();
    renderCount({ status: "RELEASING", next_episode: null, episodes: 12 });
    expect(screen.queryByText("5/12")).toBeNull();
  });
});
