import { mockInvoke as invokeMock } from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StatsModal from "@/routes/components/anilist/stats.anilist";
import { patchSettings } from "@/store/settings.store";
import type {
  ActivityDetailBundle,
  AniListCollection,
  AniListStatistics,
} from "@/types/anilist/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const rect = (width: number, height: number): DOMRect => {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
};

const DETAIL: ActivityDetailBundle = {
  entryLookup: new Map(),
  favouriteIds: new Set(),
  isLoggedIn: false,
  onFavouriteToggle: () => Promise.resolve(),
  onTag: () => undefined,
  onGenre: () => undefined,
};

const listEntry = (id: number, status: string, score: number | null, progress: number) => {
  return {
    media: {
      id,
      title: `Title ${id}`,
      cover_url: null,
      genres: ["Drama"],
      studios: [],
    },
    list_status: status,
    score,
    progress,
  };
};

const listsFixture = (): AniListCollection[] => {
  return [
    {
      name: "Completed",
      entries: [1, 2, 3, 4, 5].map((id) => listEntry(id, "COMPLETED", 80, 24)),
    },
    {
      name: "Watching",
      entries: [listEntry(6, "CURRENT", 70, 3)],
    },
    {
      // Same title listed again in a custom list must not double count.
      name: "Best of Drama",
      entries: [listEntry(5, "COMPLETED", 80, 24)],
    },
  ] as unknown as AniListCollection[];
};

const statisticsFixture = (): AniListStatistics => {
  return {
    count: 3,
    mean_score: 74.4,
    standard_deviation: 5,
    minutes_watched: 3000,
    episodes_watched: 120,
    statuses: [
      { status: "COMPLETED", count: 2, minutes_watched: 2000 },
      { status: "CURRENT", count: 1, minutes_watched: 1000 },
      { status: "PLANNING", count: 1, minutes_watched: 0 },
    ],
    scores: [
      { score: 70, count: 1 },
      { score: 80, count: 2 },
    ],
    formats: [
      { format: "TV", count: 2, mean_score: 75, minutes_watched: 2000, media_ids: [1] },
      { format: "MOVIE", count: 1, mean_score: 70, minutes_watched: 1000, media_ids: [2] },
    ],
    release_years: [
      { year: 2023, count: 2, mean_score: 75, minutes_watched: 1500, media_ids: [1, 2] },
    ],
    start_years: [
      { year: 2019, count: 3, mean_score: 74, minutes_watched: 3000, media_ids: [1, 2, 3] },
    ],
    genres: [
      { genre: "Drama", count: 3, mean_score: 78, minutes_watched: 3000, media_ids: [1, 2, 3] },
    ],
    studios: [
      {
        id: 43,
        name: "ufotable",
        count: 2,
        mean_score: 84,
        minutes_watched: 2000,
        media_ids: [1, 2],
      },
    ],
  };
};

const wrapper = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
};

const renderModal = (scoreFormat: "POINT_10" | "POINT_100") => {
  return render(
    <StatsModal
      lists={listsFixture()}
      userId={123}
      scoreFormat={scoreFormat}
      onClose={vi.fn()}
      detail={DETAIL}
    />,
    { wrapper }
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(640, 200));
  invokeMock.mockReset();
  patchSettings({ language: "en", modalAnimation: false, anilistProxyUrl: null });
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anilist_statistics") return Promise.resolve(statisticsFixture());
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("StatsModal overview", () => {
  it("renders KPI numbers and a POINT_100 mean", async () => {
    renderModal("POINT_100");
    expect(await screen.findByText("74.4/100")).toBeDefined();
    expect(screen.getAllByText("3")).toHaveLength(3);
    expect(screen.getByText("120")).toBeDefined();
    expect(screen.getByText("50")).toBeDefined();
    expect(screen.getByText("67%")).toBeDefined();
    expect(screen.getByText("Score distribution")).toBeDefined();
  });

  it("does not double count titles that also sit in a custom list", async () => {
    renderModal("POINT_10");
    // Completion by genre: 5 completed of 6 started titles; doubled would be 6/7.
    expect(await screen.findByText("83%")).toBeDefined();
  });

  it("shows the empty state for an empty account", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anilist_statistics")
        return Promise.resolve({ ...statisticsFixture(), count: 0, statuses: [] });
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderModal("POINT_10");
    expect(
      await screen.findByText(
        "No tracked titles yet. Add titles to your list and statistics will appear here."
      )
    ).toBeDefined();
  });

  it("shows the error state and retries on demand", async () => {
    invokeMock.mockImplementation((command: string) =>
      Promise.reject(new Error(`boom ${command}`))
    );
    const user = userEvent.setup();
    renderModal("POINT_10");
    await vi.waitFor(
      () => {
        expect(
          screen.queryByText(/Statistics unavailable|boom get_anilist_statistics/u)
        ).not.toBeNull();
      },
      { timeout: 10000 }
    );
    const before = invokeMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await vi.waitFor(() => {
      expect(invokeMock.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it("widens the dialog on the Overview tab only", async () => {
    const user = userEvent.setup();
    renderModal("POINT_10");
    expect(await screen.findByText("Score distribution")).toBeDefined();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.className).toContain("w-7xl");
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(dialog?.className).not.toContain("w-7xl");
    expect(dialog?.className).toContain("w-3xl");
  });

  it("opens the genre drill-down with Enter and returns on back", async () => {
    const user = userEvent.setup();
    renderModal("POINT_10");
    const genres = await screen.findByRole("application", { name: "Top genres" });
    fireEvent.focus(genres);
    fireEvent.keyDown(genres, { key: "Enter" });
    expect(await screen.findByText("Drama (3)")).toBeDefined();
    expect(screen.getByText("Title 1")).toBeDefined();
    expect(screen.getByText("Title 3")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("application", { name: "Top genres" })).toBeDefined();
  });
});
