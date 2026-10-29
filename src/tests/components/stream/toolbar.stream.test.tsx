import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STREAM_FILTERS } from "@/config/stream/filters.config";
import StreamToolbar from "@/routes/components/stream/toolbar.stream";
import { patchSettings } from "@/store/settings.store";
import { streamPage, streamQuery, submitStreamSearch } from "@/store/stream.store";

const filters = DEFAULT_STREAM_FILTERS;
const noop = () => undefined;

beforeEach(() => {
  patchSettings({ language: "en" });
  submitStreamSearch("");
});

afterEach(() => {
  cleanup();
});

describe("StreamToolbar", () => {
  it("submits the typed query on Enter", async () => {
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={vi.fn()}
        onFiltersOpen={noop}
      />
    );
    const input = screen.getByRole("textbox", { name: "Search AnimeLib..." });

    fireEvent.change(input, { target: { value: "  naruto  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(streamQuery.get()).toBe("naruto"));
    expect(streamPage.get()).toBe(1);
  });

  it("keeps the search button disabled without a query", () => {
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={vi.fn()}
        onFiltersOpen={noop}
      />
    );
    const button = screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Search AnimeLib..." }), {
      target: { value: "naruto" },
    });
    expect(button.disabled).toBe(false);
  });

  it("clears the submitted query and returns to the first page", async () => {
    submitStreamSearch("naruto");
    streamPage.set(3);
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={vi.fn()}
        onFiltersOpen={noop}
      />
    );

    const clear = screen.getByRole("button", { name: "Clear" });
    await waitFor(() => expect((clear as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(clear);

    await waitFor(() => expect(streamQuery.get()).toBe(""));
    expect(streamPage.get()).toBe(1);
    expect(
      (screen.getByRole("textbox", { name: "Search AnimeLib..." }) as HTMLInputElement).value
    ).toBe("");
  });

  it("reports a refresh without touching the query", () => {
    const onRefetch = vi.fn();
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={onRefetch}
        onFiltersOpen={noop}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(streamQuery.get()).toBe("");
  });

  it("shows progress and blocks the refresh while fetching", () => {
    render(
      <StreamToolbar
        isFetching
        filters={filters}
        onRefetch={vi.fn()}
        onFiltersOpen={noop}
      />
    );
    const refresh = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute("aria-busy")).toBe("true");
  });

  it("opens the filter modal from its own button", () => {
    const onFiltersOpen = vi.fn();
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={vi.fn()}
        onFiltersOpen={onFiltersOpen}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(onFiltersOpen).toHaveBeenCalledTimes(1);
  });

  it("counts changed filters on the button", () => {
    render(
      <StreamToolbar
        isFetching={false}
        filters={{ ...filters, adult: true, genres: [1, 2], sortType: "asc" }}
        onRefetch={vi.fn()}
        onFiltersOpen={noop}
      />
    );

    expect(screen.getByRole("button", { name: "Filters" }).textContent).toContain("4");
  });
});
