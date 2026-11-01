import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STREAM_FILTERS } from "@/config/player/streamFilters.config";
import StreamToolbar from "@/routes/components/stream/toolbar.stream";
import { patchSettings } from "@/store/settings.store";
import { streamPage, streamQuery, submitStreamSearch } from "@/store/stream.store";

import { mockInvoke } from "@/tests/mocks";

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
    render(<StreamToolbar isFetching filters={filters} onRefetch={vi.fn()} onFiltersOpen={noop} />);
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

  it("refreshes the catalog after signing in", async () => {
    let signedIn = false;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          signedIn ? { tokenSaved: true, login: "milky" } : { tokenSaved: false, login: null }
        );
      }
      if (command === "animelib_webview_login") return Promise.resolve("ok");
      if (command === "animelib_finish_webview_login") {
        signedIn = true;
        return Promise.resolve("ok");
      }
      return Promise.resolve(null);
    });

    const onRefetch = vi.fn();
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={onRefetch}
        onFiltersOpen={noop}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    await screen.findByRole("button", { name: "Sign out: milky" });
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it("signs out from the account name after confirmation", async () => {
    let signedIn = true;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "animelib_account") {
        return Promise.resolve(
          signedIn ? { tokenSaved: true, login: "milky" } : { tokenSaved: false, login: null }
        );
      }
      if (command === "animelib_token_clear") {
        signedIn = false;
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const onRefetch = vi.fn();
    render(
      <StreamToolbar
        isFetching={false}
        filters={filters}
        onRefetch={onRefetch}
        onFiltersOpen={noop}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign out: milky" }));
    await screen.findByText("Sign out of AnimeLib?");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await screen.findByRole("button", { name: "Sign in" });
    expect(mockInvoke).toHaveBeenCalledWith("animelib_token_clear", undefined);
    expect(onRefetch).toHaveBeenCalledTimes(1);
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

    expect(screen.getByRole("button", { name: "Filters" }).textContent).toContain("3");
  });
});
