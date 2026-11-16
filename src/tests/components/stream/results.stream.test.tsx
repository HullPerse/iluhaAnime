import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/stream/catalog.hook", () => ({
  useStreamHistoryProgressMap: () => new Map(),
}));

import StreamResults from "@/routes/components/stream/results.stream";
import { patchSettings } from "@/store/settings.store";
import { streamQuery, submitStreamSearch } from "@/store/stream.store";
import type { StreamingAnime } from "@/types/player/stream";

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

const renderResults = (overrides: Partial<React.ComponentProps<typeof StreamResults>> = {}) => {
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
};

beforeEach(() => {
  patchSettings({ language: "ru" });
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
    expect(screen.getByText("По запросу naruto ничего не найдено.")).toBeDefined();
  });

  it("clears the search from the empty state", async () => {
    submitStreamSearch("naruto");
    renderResults({ data: { items: [], page: 1 } });

    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    await waitFor(() => expect(streamQuery.get()).toBe(""));
  });

  it("shows the source failure with its technical detail and a retry", () => {
    const onRetry = vi.fn();
    renderResults({ error: new Error("connection refused"), onRetry });

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Запрос к каталогу не удался")).toBeDefined();
    expect(screen.getByText(/connection refused/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
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

    expect(screen.getByRole("spinbutton", { name: "Страница 2 из 5" })).toBeDefined();
    expect(screen.getByText("Рейтинг - Страница 2 - 60 на страницу")).toBeDefined();
    expect(screen.getByText("Показано с 61 по 61 из 250")).toBeDefined();
  });

  it("falls back to a short page as the last page", () => {
    renderResults({ data: { items: [NARUTO], page: 1 } });
    expect(screen.getByRole("spinbutton", { name: "Страница 1 из 1" })).toBeDefined();
  });
});
