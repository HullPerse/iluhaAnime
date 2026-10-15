import { mockInvoke } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EntryLookup } from "@/lib/anilist/entries.utils";
import AniListCard from "@/routes/components/anilist/card.anilist";
import { anilistProgressOverride } from "@/store/anilistProgress.store";
import { patchSettings } from "@/store/settings.store";
import { themeAtoms } from "@/store/theme.store";
import type { AniMedia } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
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

afterEach(() => {
  themeAtoms.currentTheme.set("win95");
  anilistProgressOverride.reset();
  cleanup();
});

beforeEach(() => {
  mockInvoke.mockResolvedValue(null);
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
              list_status: "COMPLETED",
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

  it("debounces the save and shows loader then a checkmark", async () => {
    vi.useFakeTimers();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockClear();
      renderWithData();
      fireEvent.click(screen.getByRole("button", { name: "Watch one more episode" }));
      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("save_anilist_entry", expect.anything());
      expect(screen.getByRole("button", { name: "Watch one more episode" })).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ mediaId: MEDIA_ID, progress: 21, status: "COMPLETED" })
      );
      expect(screen.getByLabelText("Progress saved")).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.queryByLabelText("Progress saved")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes the pending save on unmount", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    const view = renderWithData();
    fireEvent.click(screen.getByRole("button", { name: "Watch one more episode" }));
    view.unmount();
    await waitFor(() =>
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "save_anilist_entry",
        expect.objectContaining({ mediaId: MEDIA_ID, progress: 21 })
      )
    );
  });
});

describe("ProgressStepper coalescing", () => {
  function renderCoalescing() {
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
    render(
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
    return client;
  }

  function saveCalls(invoke: ReturnType<typeof vi.fn>) {
    return invoke.mock.calls.filter((call) => call[0] === "save_anilist_entry");
  }

  it("applies rapid clicks instantly and syncs the trailing target once", async () => {
    vi.useFakeTimers();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockClear();
      const client = renderCoalescing();
      const plus = screen.getByRole("button", { name: "Watch one more episode" });
      fireEvent.click(plus);
      fireEvent.click(plus);
      fireEvent.click(plus);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      const calls = saveCalls(vi.mocked(invoke));
      expect(calls.length).toBe(1);
      expect(calls[0]?.[1]).toEqual(expect.objectContaining({ mediaId: MEDIA_ID, progress: 23 }));
      const data = client.getQueryData<{ lists: { entries: { progress: number }[] }[] }>([
        "anilist_data",
      ]);
      expect(data?.lists[0].entries[0].progress).toBe(23);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves the shown progress on click before the cache is written", async () => {
    vi.useFakeTimers();
    try {
      const client = renderCoalescing();
      const plus = screen.getByRole("button", { name: "Watch one more episode" });
      fireEvent.click(plus);
      fireEvent.click(plus);
      expect(screen.getByText("22/28")).toBeTruthy();
      const before = client.getQueryData<{ lists: { entries: { progress: number }[] }[] }>([
        "anilist_data",
      ]);
      expect(before?.lists[0].entries[0].progress).toBe(20);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      const after = client.getQueryData<{ lists: { entries: { progress: number }[] }[] }>([
        "anilist_data",
      ]);
      expect(after?.lists[0].entries[0].progress).toBe(22);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adopts the server-normalized progress and status", async () => {
    vi.useFakeTimers();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockClear();
      vi.mocked(invoke).mockImplementation((command: unknown) => {
        if (command === "save_anilist_entry")
          return Promise.resolve({ id: 1, status: "COMPLETED", progress: 28, customLists: [] });
        return Promise.resolve(null);
      });
      const client = renderCoalescing();
      fireEvent.click(screen.getByRole("button", { name: "Watch one more episode" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      const data = client.getQueryData<{
        lists: { entries: { progress: number; list_status: string }[] }[];
      }>(["anilist_data"]);
      expect(data?.lists[0].entries[0].progress).toBe(28);
      expect(data?.lists[0].entries[0].list_status).toBe("COMPLETED");
      expect(anilistProgressOverride.get(MEDIA_ID)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a newer click when an older save fails", async () => {
    vi.useFakeTimers();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockClear();
      const pending: ((value: unknown) => void)[] = [];
      const rejecters: ((reason?: unknown) => void)[] = [];
      vi.mocked(invoke).mockImplementation((command: unknown) => {
        if (command !== "save_anilist_entry") return Promise.resolve(null);
        return new Promise((resolve, reject) => {
          pending.push(resolve);
          rejecters.push(reject);
        });
      });
      const client = renderCoalescing();
      const plus = screen.getByRole("button", { name: "Watch one more episode" });
      fireEvent.click(plus);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(pending.length).toBe(1);
      fireEvent.click(plus);
      expect(screen.getByText("22/28")).toBeTruthy();
      await act(async () => {
        rejecters[0]?.(new Error("429 Too Many Requests"));
        await Promise.resolve();
      });
      expect(screen.getByText("22/28")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(pending.length).toBe(2);
      await act(async () => {
        pending[1]?.({ id: 1, status: "CURRENT", progress: 22, customLists: [] });
        await Promise.resolve();
      });
      const data = client.getQueryData<{ lists: { entries: { progress: number }[] }[] }>([
        "anilist_data",
      ]);
      expect(data?.lists[0].entries[0].progress).toBe(22);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rolls back to the confirmed value and retries on failure", async () => {
    vi.useFakeTimers();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockClear();
      vi.mocked(invoke).mockRejectedValueOnce(new Error("429 Too Many Requests"));
      const client = renderCoalescing();
      fireEvent.click(screen.getByRole("button", { name: "Watch one more episode" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
      const data = client.getQueryData<{ lists: { entries: { progress: number }[] }[] }>([
        "anilist_data",
      ]);
      expect(data?.lists[0].entries[0].progress).toBe(20);
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(650);
      });
      const calls = saveCalls(vi.mocked(invoke));
      expect(calls.length).toBe(2);
      expect(calls[1]?.[1]).toEqual(expect.objectContaining({ mediaId: MEDIA_ID, progress: 21 }));
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AniListCard short meta", () => {
  function renderReleasing() {
    const client = new QueryClient();
    return render(
      <QueryClientProvider client={client}>
        <AniListCard
          item={makeMedia({ status: "RELEASING", next_episode: 5 })}
          entryLookup={makeLookup(null)}
          isFavorite={false}
          scoreFormat="POINT_10"
          onClick={vi.fn()}
        />
      </QueryClientProvider>
    );
  }

  it("shows the aired count on full meta themes", () => {
    renderReleasing();
    expect(screen.getByText("4/28")).toBeTruthy();
    expect(screen.getByText("20/28")).toBeTruthy();
  });

  it("hides the aired count but keeps progress on short meta themes", () => {
    themeAtoms.currentTheme.set("terminal");
    renderReleasing();
    expect(screen.queryByText("4/28")).toBeNull();
    expect(screen.getByText("20/28")).toBeTruthy();
  });
});
