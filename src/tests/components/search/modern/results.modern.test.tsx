import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModernResults from "@/routes/components/search/modern/results.modern";
import { patchSettings } from "@/store/settings.store";
import type { SearchQueryController } from "@/types/search";
import type { Anime } from "@/types/torrent";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
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

function renderResults(controller: Partial<SearchQueryController>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ModernResults
        controller={
          {
            isLoading: false,
            searchParams: "naruto",
            didYouMean: null,
            applyDidYouMean: vi.fn(),
            filters: {},
            setFilters: vi.fn(),
            isError: false,
            error: null,
            refetch: vi.fn(),
            data: [ITEM],
            displayItems: [ITEM],
            isPagedSource: false,
            nyaaPage: 1,
            setNyaaPage: vi.fn(),
            resultsPerPage: 20,
            loadingMagnet: {},
            copyMagnetFor: vi.fn(),
            openMagnetFor: vi.fn(),
            downloadMagnetFor: vi.fn(),
            setSelectedTorrent: vi.fn(),
            ...controller,
          } as unknown as SearchQueryController
        }
      />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  patchSettings({ torrentCoversEnabled: false });
});

beforeEach(() => {
  patchSettings({ language: "en", torrentCoversEnabled: false });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async () => null);
});

describe("ModernResults row source", () => {
  it("keeps the fetched source on rows after the selector moves", () => {
    renderResults({ source: "rutracker", resultSource: "erai-raws" });
    expect(screen.getByText("Erai-Raws")).toBeDefined();
    expect(screen.queryByText("Rutracker")).toBeNull();
  });

  it("opens details with the fetched source, not the live selector", () => {
    const setSelectedTorrent = vi.fn();
    renderResults({ source: "rutracker", resultSource: "erai-raws", setSelectedTorrent });
    fireEvent.click(screen.getByText(ITEM.title));
    expect(setSelectedTorrent).toHaveBeenCalledWith({ item: ITEM, source: "erai-raws" });
  });

  it("falls back to the live source before any search settles", () => {
    renderResults({ source: "rutracker", resultSource: null });
    expect(screen.getByText("Rutracker")).toBeDefined();
    expect(screen.queryByText("Erai-Raws")).toBeNull();
  });
});
