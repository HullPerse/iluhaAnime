import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListMetadata from "@/routes/components/anilist/detail/metadata.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const NOW = 1_728_000_000_000;

function makeAnime(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    id: 501,
    title: "Frieren",
    titles: ["Frieren"],
    episodes: 28,
    duration: 24,
    format: "TV",
    status: "RELEASING",
    score: null,
    genres: [],
    tags: [],
    description: null,
    cover_url: null,
    season: null,
    season_year: 2024,
    studios: [],
    next_episode: null,
    next_airing_at: null,
    start_date: null,
    end_date: null,
    popularity: null,
    favourites: null,
    rankings: [],
    relations: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("AniListMetadata airing line", () => {
  it("shows the local date, time, and countdown for the next episode", () => {
    const airingAt = NOW / 1000 + 2 * 86_400 + 3600;
    render(<AniListMetadata anime={makeAnime({ next_episode: 13, next_airing_at: airingAt })} />);
    const line = screen.getByText(/Episode 13/u);
    expect(line.textContent).toContain(
      new Date(airingAt * 1000).toLocaleString("en", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      })
    );
    expect(line.textContent).toContain("in 2 d 1 h");
    expect(line.title).toBe(new Date(airingAt * 1000).toLocaleString("en"));
  });

  it("hides the line without airing data", () => {
    render(<AniListMetadata anime={makeAnime()} />);
    expect(screen.queryByText(/Episode/u)).toBeNull();
  });

  it("refreshes the countdown on the tick", () => {
    const airingAt = NOW / 1000 + 125;
    render(<AniListMetadata anime={makeAnime({ next_episode: 13, next_airing_at: airingAt })} />);
    expect(screen.getByText(/Episode 13/u).textContent).toContain("in 2 min 5 sec");
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText(/Episode 13/u).textContent).toContain("in 1 min");
  });
});
