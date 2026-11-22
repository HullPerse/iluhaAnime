import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STREAM_FILTERS } from "@/config/player/streamFilters.config";
import StreamSortBar from "@/routes/components/stream/sort.stream";
import { patchSettings } from "@/store/settings.store";
import {
  applyStreamFilters,
  selectStreamSource,
  streamFilters,
  streamPage,
} from "@/store/stream.store";

const noop = () => undefined;

const setMeasuredWidth = (width: number) => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
};

beforeEach(() => {
  patchSettings({ language: "ru" });
  selectStreamSource("animelib");
  applyStreamFilters({ ...DEFAULT_STREAM_FILTERS });
  setMeasuredWidth(600);
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  cleanup();
});

describe("StreamSortBar", () => {
  it("sorts the AllAnime catalog and resets its page", () => {
    selectStreamSource("allanime");
    streamPage.set(3);
    render(<StreamSortBar onHistoryOpen={noop} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
      }),
    );
    expect(streamFilters.get().sortBy).toBe("name");
    expect(streamFilters.get().sortType).toBe("asc");
    expect(streamPage.get()).toBe(1);
  });

  it("disables paging arrows when all sort options fit", () => {
    render(<StreamSortBar onHistoryOpen={noop} />);
    expect(
      (
        screen.getByRole("button", {
          name: "\u0414\u0430\u043B\u0435\u0435",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "\u041D\u0430\u0437\u0430\u0434",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("starts a picked key in its own direction", () => {
    render(<StreamSortBar onHistoryOpen={noop} />);

    expect(
      screen
        .getByRole("button", { name: "Рейтинг" })
        .getAttribute("aria-current"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Название" }));
    expect(streamFilters.get().sortBy).toBe("name");
    expect(streamFilters.get().sortType).toBe("asc");
    expect(
      screen
        .getByRole("button", { name: "Название" })
        .getAttribute("aria-current"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Популярное" }));
    expect(streamFilters.get().sortBy).toBe("views");
    expect(streamFilters.get().sortType).toBe("desc");
    expect(
      screen
        .getByRole("button", { name: "Рейтинг" })
        .getAttribute("aria-current"),
    ).toBe(null);
  });

  it("flips the direction when the active key is picked again", () => {
    render(<StreamSortBar onHistoryOpen={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "Рейтинг" }));
    expect(streamFilters.get().sortBy).toBe("rating_score");
    expect(streamFilters.get().sortType).toBe("asc");

    fireEvent.click(screen.getByRole("button", { name: "Рейтинг" }));
    expect(streamFilters.get().sortType).toBe("desc");
  });

  it("returns to the first page on any sort change", () => {
    streamPage.set(4);
    render(<StreamSortBar onHistoryOpen={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "Новое" }));

    expect(streamPage.get()).toBe(1);
    expect(streamFilters.get().sortBy).toBe("created_at");
  });

  it("opens the watch history from its own button", () => {
    const onHistoryOpen = vi.fn();
    render(<StreamSortBar onHistoryOpen={onHistoryOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "История" }));

    expect(onHistoryOpen).toHaveBeenCalledTimes(1);
  });

  it("pages the keys when the bar is too narrow to hold them", () => {
    setMeasuredWidth(100);
    render(<StreamSortBar onHistoryOpen={noop} />);

    expect(screen.queryByRole("button", { name: "Название" })).toBe(null);

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.queryByRole("button", { name: "Рейтинг" })).toBe(null);
    expect(screen.queryByRole("button", { name: "Название" })).not.toBe(null);
  });
});
