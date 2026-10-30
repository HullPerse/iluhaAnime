import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_STREAM_FILTERS } from "@/config/stream/filters.config";
import StreamSortBar from "@/routes/components/stream/sort.stream";
import { patchSettings } from "@/store/settings.store";
import { applyStreamFilters, streamFilters, streamPage } from "@/store/stream.store";

// jsdom measures every element as zero wide, which pages the bar down to one
// key. A real window fits all four, so the tests set the measured width.
function setMeasuredWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
}

beforeEach(() => {
  patchSettings({ language: "en" });
  applyStreamFilters({ ...DEFAULT_STREAM_FILTERS });
  setMeasuredWidth(600);
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  cleanup();
});

describe("StreamSortBar", () => {
  it("starts a picked key in its own direction", () => {
    render(<StreamSortBar />);

    expect(screen.getByRole("button", { name: "Rating" }).getAttribute("aria-current")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(streamFilters.get().sortBy).toBe("name");
    expect(streamFilters.get().sortType).toBe("asc");
    expect(screen.getByRole("button", { name: "Title" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Popular" }));
    expect(streamFilters.get().sortBy).toBe("views");
    expect(streamFilters.get().sortType).toBe("desc");
    expect(screen.getByRole("button", { name: "Rating" }).getAttribute("aria-current")).toBe(null);
  });

  it("flips the direction when the active key is picked again", () => {
    render(<StreamSortBar />);

    fireEvent.click(screen.getByRole("button", { name: "Rating" }));
    expect(streamFilters.get().sortBy).toBe("rating_score");
    expect(streamFilters.get().sortType).toBe("asc");

    fireEvent.click(screen.getByRole("button", { name: "Rating" }));
    expect(streamFilters.get().sortType).toBe("desc");
  });

  it("returns to the first page on any sort change", () => {
    streamPage.set(4);
    render(<StreamSortBar />);

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(streamPage.get()).toBe(1);
    expect(streamFilters.get().sortBy).toBe("created_at");
  });

  it("pages the keys when the bar is too narrow to hold them", () => {
    setMeasuredWidth(100);
    render(<StreamSortBar />);

    // The active key owns the visible page, so only Rating is on screen.
    expect(screen.queryByRole("button", { name: "Title" })).toBe(null);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByRole("button", { name: "Rating" })).toBe(null);
    expect(screen.queryByRole("button", { name: "Title" })).not.toBe(null);
  });
});
