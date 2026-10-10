import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSearchQuery } from "@/hooks/search/query.hook";
import { setCrossSearchQuery, setResultSource } from "@/store/search.store";
import type { Source } from "@/types/search";
import type { Anime } from "@/types/torrent";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function item(title: string, link: string): Anime {
  return {
    title,
    magnet: "",
    torrent: "",
    size: "1 GB",
    seeders: 1,
    leechers: 0,
    category: "Anime",
    link,
    date: "2024-01-01",
  };
}

const ITEM_A = item("[Erai] Naruto - 01", "https://erai/1");
const ITEM_B = item("Naruto [1080p]", "https://rutracker/2");

function commandFor(source: Source): string {
  return source === "rutracker" ? "search_rutracker" : "search_erairaws";
}

function itemFor(source: Source): Anime {
  return source === "rutracker" ? ITEM_B : ITEM_A;
}

function renderSearch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useSearchQuery(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  setCrossSearchQuery(null);
  setResultSource(null);
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (command: unknown) => {
    if (command === "search_erairaws") return [ITEM_A];
    if (command === "search_rutracker") return [ITEM_B];
    if (typeof command === "string" && command.includes("session")) return true;
    return null;
  });
});

describe("useSearchQuery result source", () => {
  it("keeps the fetched source on rows after switching sources without searching", async () => {
    const { result } = renderSearch();
    const firstSource = result.current.source as Source;
    const other: Source = firstSource === "rutracker" ? "erai-raws" : "rutracker";
    act(() => {
      setCrossSearchQuery("naruto");
    });
    await waitFor(() => expect(result.current.displayItems?.length).toBe(1));
    expect(result.current.resultSource).toBe(firstSource);
    act(() => {
      result.current.changeSource(other);
    });
    expect(result.current.resultSource).toBe(firstSource);
    expect(result.current.displayItems?.length).toBe(1);
  });

  it("moves the result source to the searched source after a real search", async () => {
    const { result } = renderSearch();
    const firstSource = result.current.source as Source;
    const other: Source = firstSource === "rutracker" ? "erai-raws" : "rutracker";
    act(() => {
      setCrossSearchQuery("naruto");
    });
    await waitFor(() => expect(result.current.displayItems?.length).toBe(1));
    act(() => {
      result.current.changeSource(other);
      setCrossSearchQuery("naruto");
    });
    await waitFor(() => expect(result.current.resultSource).toBe(other));
  });

  it("reports fetching while a background search replaces stale rows", async () => {
    const { result } = renderSearch();
    const firstSource = result.current.source as Source;
    const other: Source = firstSource === "rutracker" ? "erai-raws" : "rutracker";
    let resolveSecond!: (value: Anime[]) => void;
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === commandFor(other)) {
        return new Promise<Anime[]>((resolve) => {
          resolveSecond = resolve;
        });
      }
      if (command === commandFor(firstSource)) return [itemFor(firstSource)];
      if (typeof command === "string" && command.includes("session")) return true;
      return null;
    });
    act(() => {
      setCrossSearchQuery("naruto");
    });
    await waitFor(() => expect(result.current.displayItems?.length).toBe(1));
    act(() => {
      result.current.changeSource(other);
      setCrossSearchQuery("naruto");
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      resolveSecond([itemFor(other)]);
    });
    await waitFor(() => expect(result.current.resultSource).toBe(other));
  });

  it("keeps the fetched source on stale rows until the next search settles", async () => {
    const { result } = renderSearch();
    const firstSource = result.current.source as Source;
    const other: Source = firstSource === "rutracker" ? "erai-raws" : "rutracker";
    const resolvers: Array<(value: Anime[]) => void> = [];
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === commandFor(firstSource) || command === commandFor(other)) {
        return new Promise<Anime[]>((resolve) => {
          resolvers.push(resolve);
        });
      }
      if (typeof command === "string" && command.includes("session")) return true;
      return null;
    });
    act(() => {
      setCrossSearchQuery("naruto");
    });
    await act(async () => {
      const resolveFirst = resolvers.at(0);
      if (!resolveFirst) throw new Error("missing pending search");
      resolveFirst([itemFor(firstSource)]);
    });
    await waitFor(() => expect(result.current.displayItems?.length).toBe(1));
    await waitFor(() => expect(result.current.resultSource).not.toBeNull());
    const fetched = result.current.resultSource as Source;
    expect(fetched).toBe(firstSource);
    act(() => {
      result.current.changeSource(other);
      setCrossSearchQuery("naruto");
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.resultSource).toBe(fetched);
    await act(async () => {
      const resolveLast = resolvers.at(-1);
      if (!resolveLast) throw new Error("missing pending search");
      resolveLast([itemFor(other)]);
    });
    await waitFor(() => expect(result.current.resultSource).toBe(other));
  });
});
