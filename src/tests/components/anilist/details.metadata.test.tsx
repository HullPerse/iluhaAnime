import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import AniListMetadata from "@/routes/components/anilist/details.metadata";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const baseAnime: AniMedia = {
  id: 1,
  title: "Test Anime",
  titles: [],
  episodes: 12,
  duration: 24,
  format: "TV",
  status: "FINISHED",
  score: 85,
  genres: [],
  tags: [],
  description: null,
  cover_url: null,
  season: "WINTER",
  season_year: 2024,
  studios: [],
  next_episode: null,
  next_airing_at: null,
  start_date: "2024-01-01",
  end_date: "2024-03-31",
  popularity: 5000,
  favourites: 200,
  rankings: [
    { rank: 42, type_: "POPULAR", context: "most popular in winter 2024" },
  ],
  relations: [],
};

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("AniListMetadata", () => {
  it("renders the anime title as image alt text", () => {
    render(<AniListMetadata anime={baseAnime} />);
    expect(screen.getByRole("img", { name: "Test Anime" })).toBeTruthy();
  });

  it("renders score badge when present", () => {
    const { container } = render(<AniListMetadata anime={baseAnime} />);
    const badge = container.querySelector(".bg-secondary");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("85");
  });

  it("hides score badge when null", () => {
    const { container } = render(
      <AniListMetadata anime={{ ...baseAnime, score: null }} />
    );
    const badges = container.querySelectorAll(".bg-secondary");
    expect(badges).toHaveLength(0);
  });

  it("renders episode count and duration", () => {
    const { container } = render(<AniListMetadata anime={baseAnime} />);
    expect(container.textContent).toContain("12 ep.");
    expect(container.textContent).toContain("24");
  });

  it("renders season", () => {
    const { container } = render(<AniListMetadata anime={baseAnime} />);
    expect(container.textContent).toContain("Winter");
  });

  it("renders start and end dates for finished anime", () => {
    const { container } = render(<AniListMetadata anime={baseAnime} />);
    expect(container.textContent).toContain("2024-01-01");
    expect(container.textContent).toContain("2024-03-31");
  });

  it("renders popularity and favourites counts", () => {
    const { container } = render(<AniListMetadata anime={baseAnime} />);
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("200");
  });

  it("renders best ranking", () => {
    const { container } = render(<AniListMetadata anime={baseAnime} />);
    expect(container.textContent).toContain("#42");
  });

  it("hides next episode when null", () => {
    render(<AniListMetadata anime={baseAnime} />);
    expect(screen.queryByText(/next episode/i)).toBeNull();
  });

  it("renders next episode when airing info present", () => {
    const upcoming = {
      ...baseAnime,
      next_episode: 5,
      next_airing_at: Math.floor(Date.now() / 1000) + 86400,
    };
    const { container } = render(<AniListMetadata anime={upcoming} />);
    expect(container.textContent).toContain("5");
  });
});
