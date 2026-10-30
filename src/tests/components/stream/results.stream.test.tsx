import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/stream/catalog.hook", () => ({
  useStreamHistoryProgress: () => ({ data: null }),
}));

import StreamResults from "@/routes/components/stream/results.stream";
import { patchSettings } from "@/store/settings.store";
import { streamQuery, submitStreamSearch } from "@/store/stream.store";
import type { StreamingAnime } from "@/types/stream";

const NARUTO: StreamingAnime = {
  id: "11",
  title: "Naruto",
  synonyms: ["NARUTO"],
  cover: "https://cdn.example/naruto.jpg",
  year: 2002,
  status: "Завершён",
  genres: ["Action"],
  episodeCount: 220,
  rating: 8.4,
  mediaType: "TV Сериал",
  anilistId: 20,
  slugUrl: "11--naruto-anime",
};

function renderResults(overrides: Partial<React.ComponentProps<typeof StreamResults>> = {}) {
  return render(
    <StreamResults
      data={undefined}
      isPending={false}
      error={null}
      onOpen={vi.fn()}
      onRetry={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  patchSettings({ language: "en" });
  submitStreamSearch("");
});

afterEach(() => {
  cleanup();
});

describe("StreamResults loading", () => {
  it("draws skeleton tiles instead of a line of text", () => {
    renderResults({ isPending: true });
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.querySelectorAll(".animate-pulse").length).toBeGreaterThan(12);
  });
});

describe("StreamResults states", () => {
  it("names the query when nothing matches", () => {
    submitStreamSearch("naruto");
    renderResults({ data: { items: [], page: 1 } });
    expect(screen.getByText("Nothing found for naruto.")).toBeDefined();
  });

  it("clears the search from the empty state", async () => {
    submitStreamSearch("naruto");
    renderResults({ data: { items: [], page: 1 } });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(streamQuery.get()).toBe(""));
  });

  it("shows the source failure with its technical detail and a retry", () => {
    const onRetry = vi.fn();
    renderResults({ error: new Error("connection refused"), onRetry });

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("The catalog request failed")).toBeDefined();
    expect(screen.getByText(/connection refused/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("StreamResults grid", () => {
  it("renders a card per item and opens it", () => {
    const onOpen = vi.fn();
    renderResults({ data: { items: [NARUTO], page: 1, lastPage: 1, total: 1 }, onOpen });

    expect(screen.getByText("Naruto")).toBeDefined();
    expect(screen.getByText("2002, TV Сериал")).toBeDefined();
    expect(screen.getByText("8.4/10")).toBeDefined();
    expect(screen.queryByText("AniList")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Naruto" }));
    expect(onOpen).toHaveBeenCalledWith(NARUTO);
  });

  it("walks the grid with the arrow keys and keeps one Tab stop", () => {
    renderResults({
      data: { items: [NARUTO, { ...NARUTO, id: "12", title: "Bleach" }], page: 1, lastPage: 1 },
    });
    const tiles = screen
      .getAllByRole("button")
      .filter((tile) => tile.dataset.streamCard !== undefined);
    expect(tiles).toHaveLength(2);
    expect(tiles.filter((tile) => tile.tabIndex === 0)).toHaveLength(1);

    tiles[0].focus();
    act(() => {
      tiles[0].dispatchEvent(
        new KeyboardEvent("keydown", { code: "ArrowRight", bubbles: true, cancelable: true })
      );
    });

    expect(document.activeElement).toBe(tiles[1]);
    expect(tiles[1].tabIndex).toBe(0);
  });

  it("takes the last page and the total from the API meta", () => {
    renderResults({ data: { items: [NARUTO], page: 2, lastPage: 5, total: 250 } });

    expect(screen.getByRole("spinbutton", { name: "Page 2 of 5" })).toBeDefined();
    expect(screen.getByText("Rating - Page 2 - 60 per page")).toBeDefined();
    expect(screen.getByText("Showing 61 to 61 of 250")).toBeDefined();
  });

  it("falls back to a short page as the last page", () => {
    renderResults({ data: { items: [NARUTO], page: 1 } });
    expect(screen.getByRole("spinbutton", { name: "Page 1 of 1" })).toBeDefined();
  });
});
