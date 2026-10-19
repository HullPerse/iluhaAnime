import { mockInvoke } from "../../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InputSearch from "@/routes/components/search/modern/input.search";
import { patchSettings } from "@/store/settings.store";
import type { Anime } from "@/types/torrent";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const ITEM: Anime = {
  title: "[Erai-raws] Naruto - 01 (1080p).mkv",
  magnet: "",
  torrent: "",
  size: "300 MB",
  seeders: 5,
  leechers: 1,
  category: "Anime",
  link: "https://animetosho.org/view/1",
  date: "2024-01-01",
};

function renderInputSearch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InputSearch />
    </QueryClientProvider>
  );
}

function pendingSearches() {
  const resolvers: Array<(value: Anime[]) => void> = [];
  mockInvoke.mockImplementation(async (command: unknown) => {
    if (command === "search_rutracker") {
      return new Promise<Anime[]>((resolve) => resolvers.push(resolve));
    }
    if (typeof command === "string" && command.includes("session")) return true;
    return null;
  });
  return resolvers;
}

function submitButton() {
  return screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
}

async function submitQuery(query: string, button: HTMLButtonElement) {
  fireEvent.change(screen.getByPlaceholderText("Search anime..."), { target: { value: query } });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
}

afterEach(cleanup);

beforeEach(() => {
  patchSettings({ language: "en", torrentCoverMode: "off" });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async () => null);
});

describe("Modern search submit button", () => {
  it("spins while a repeat search replaces settled rows", async () => {
    const searches = pendingSearches();
    renderInputSearch();
    const button = submitButton();

    await submitQuery("naruto", button);
    await waitFor(() => expect(searches.length).toBe(1));
    const resolveFirst = searches.at(0);
    if (!resolveFirst) throw new Error("missing first search");
    await act(async () => {
      resolveFirst([ITEM]);
    });
    await waitFor(() => expect(screen.getByText(ITEM.title)).toBeDefined());
    expect(button.getAttribute("aria-busy")).toBeNull();

    await submitQuery("bleach", button);
    await waitFor(() => expect(searches.length).toBe(2));
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".ui-loading-spinner")).not.toBeNull();

    const resolveSecond = searches.at(1);
    if (!resolveSecond) throw new Error("missing second search");
    await act(async () => {
      resolveSecond([]);
    });
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
    expect(button.querySelector(".ui-loading-spinner")).toBeNull();
  });
});
