import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EntryLookup } from "@/lib/anilist/entries.utils";
import AniListCard from "@/routes/components/anilist/card.anilist";
import { patchSettings } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const MEDIA_ID = 501;

function makeMedia(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    id: MEDIA_ID,
    title: "Frieren",
    titles: ["Frieren"],
    episodes: 28,
    duration: 24,
    format: "TV",
    status: "FINISHED",
    score: null,
    genres: [],
    tags: [],
    description: null,
    cover_url: null,
    season: null,
    season_year: 2023,
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

function makeLookup(score: number | null): EntryLookup {
  return new Map([
    [
      MEDIA_ID,
      {
        list_status: "COMPLETED",
        progress: 20,
        score,
        created_at: null,
        updated_at: null,
        completed_at: null,
        started_at: null,
        notes: null,
        custom_lists: [],
      },
    ],
  ]);
}

function renderCard(scoreFormat: string, score: number | null) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AniListCard
        item={makeMedia()}
        entryLookup={makeLookup(score)}
        isFavorite={false}
        scoreFormat={scoreFormat as "POINT_10"}
        onClick={vi.fn()}
      />
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  patchSettings({ language: "en" });
});

describe("AniListCard score badge", () => {
  it("shows the 100 point score with its denominator", () => {
    renderCard("POINT_100", 55);
    expect(screen.getByTitle("My score: 55/100")).toBeTruthy();
  });

  it("shows a plain ten point score with its denominator", () => {
    renderCard("POINT_10", 8);
    expect(screen.getByTitle("My score: 8/10")).toBeTruthy();
  });

  it("shows a decimal score as entered", () => {
    renderCard("POINT_10_DECIMAL", 8.5);
    expect(screen.getByTitle("My score: 8.5/10")).toBeTruthy();
  });

  it("swaps the number for a smiley icon on the three point format", () => {
    renderCard("POINT_3", 3);
    const badge = screen.getByLabelText("My score: :)");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(badge.textContent).not.toMatch(/[0-9]/u);
  });

  it("renders nothing without a score", () => {
    renderCard("POINT_100", null);
    expect(screen.queryByTitle(/My score/u)).toBeNull();
  });
});

describe("ProgressStepper", () => {
  function renderWithData() {
    const client = new QueryClient();
    client.setQueryData(["anilist_data"], {
      user: { id: 7 },
      lists: [
        {
          name: "Completed",
          entries: [
            {
              media: makeMedia(),
              progress: 20,
              score: null,
              list_status: "CURRENT",
              created_at: null,
              updated_at: null,
              completed_at: null,
              started_at: null,
              notes: null,
              repeat: null,
            },
          ],
        },
      ],
      favourites: [],
      people: { staff: [], characters: [] },
    });
    return render(
      <QueryClientProvider client={client}>
        <AniListCard
          item={makeMedia()}
          entryLookup={makeLookup(null)}
          isFavorite={false}
          scoreFormat="POINT_10"
          onClick={vi.fn()}
        />
      </QueryClientProvider>
    );
  }

  it("saves progress plus one and disables minus at zero", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    renderWithData();
    fireEvent.click(screen.getByRole("button", { name: "Watch one more episode" }));
    await waitFor(() =>
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ mediaId: MEDIA_ID, progress: 21, status: "COMPLETED" })
      )
    );
  });
});
