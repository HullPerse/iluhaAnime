import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnimeOptionRow from "@/routes/components/lobby/anime-option.lobby";
import type { AniMedia } from "@/types/anilist";

function media(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    banner_image: null,
    cover_url: "https://s4.anilist.co/file/cover.jpg",
    description: null,
    duration: null,
    end_date: null,
    episodes: 24,
    favourites: null,
    format: "TV",
    genres: [],
    id: 21,
    id_mal: null,
    next_airing_at: null,
    next_episode: null,
    popularity: null,
    rankings: [],
    relations: [],
    score: 87,
    season: null,
    season_year: 1999,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "One Piece",
    title_english: null,
    title_native: null,
    title_romaji: null,
    titles: [],
    trailer_youtube_id: null,
    ...overrides,
  };
}

function row(props: Partial<Parameters<typeof AnimeOptionRow>[0]> = {}) {
  const onPick = vi.fn();
  const view = render(
    <AnimeOptionRow
      brief={props.brief ?? media()}
      highlighted={props.highlighted ?? false}
      onPick={props.onPick ?? onPick}
      title={props.title ?? "One Piece"}
    />
  );
  return { onPick, container: view.container };
}

afterEach(cleanup);

describe("AnimeOptionRow", () => {
  it("renders the title with a format and year hint", () => {
    row();

    const option = screen.getByTitle("One Piece");
    expect(option.textContent).toContain("One Piece");
    expect(option.textContent).toContain("TV · 1999");
  });

  it("reports the pick with the anime id", () => {
    const { onPick } = row({ brief: media({ id: 7 }) });

    fireEvent.click(screen.getByTitle("One Piece"));

    expect(onPick).toHaveBeenCalledWith(7);
  });

  it("marks the highlighted option as selected", () => {
    row({ highlighted: true });

    expect(screen.getByTitle("One Piece").getAttribute("aria-selected")).toBe(
      "true"
    );
  });

  it("leaves a non-highlighted option unselected", () => {
    row({ highlighted: false });

    expect(screen.getByTitle("One Piece").getAttribute("aria-selected")).toBe(
      "false"
    );
  });

  it("renders the cover image when present", () => {
    const { container } = row();

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://s4.anilist.co/file/cover.jpg"
    );
  });

  it("renders no cover without a cover url", () => {
    const { container } = row({ brief: media({ cover_url: null }) });

    expect(container.querySelector("img")).toBeNull();
  });

  it("renders no hint without format and year", () => {
    row({ brief: media({ format: null, season_year: null }) });

    expect(screen.getByTitle("One Piece").textContent).toBe("One Piece");
  });
});
