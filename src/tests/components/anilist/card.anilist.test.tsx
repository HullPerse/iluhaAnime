import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import AniListEntryCard from "@/routes/components/anilist/card.anilist";
import type { AniMedia } from "@/types/anilist";

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
  return new Map([[21, { list_status: "CURRENT", progress: 5, score }]]);
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
      <AniListEntryCard item={makeItem()} entryLookup={new Map()} isFavorite={false} onClick={() => {}} />
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
