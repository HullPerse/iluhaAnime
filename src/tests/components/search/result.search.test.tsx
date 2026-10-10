import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchResultItem from "@/routes/components/search/default/result.search";
import { removeResolvedCover } from "@/store/cover.store";
import { patchSettings } from "@/store/settings.store";
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
  link: "https://example.com/t/1",
  date: "2024-01-01",
};

const NARUTO_MEDIA = {
  id: 20,
  title: "NARUTO",
  titles: ["NARUTO"],
  title_romaji: "NARUTO",
  format: "TV",
  season_year: 2002,
  cover_url: "https://s4.anilist.co/file/naruto.jpg",
};

function renderRow(handlers?: { onOpenDetails?: (item: Anime) => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchResultItem
        item={ITEM}
        source="erai-raws"
        loadingMagnet={{}}
        onCopyMagnet={vi.fn()}
        onOpenMagnet={vi.fn()}
        onDownload={vi.fn()}
        onOpenLink={vi.fn()}
        onOpenDetails={handlers?.onOpenDetails ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  removeResolvedCover("naruto|0");
  patchSettings({ torrentCoversEnabled: false });
});

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("SearchResultItem covers", () => {
  it("renders no thumbnail while the setting is off and fires no cover queries", async () => {
    patchSettings({ torrentCoversEnabled: false });
    const { container } = renderRow();
    await waitFor(() => expect(screen.getByText(ITEM.title)).toBeDefined());
    const cover = container.querySelector(
      'img[src*="unknown_source"], img[src*="asset.localhost"]'
    );
    expect(cover).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "search_anilist")).toBe(false);
  });

  it("resolves and renders the cover through the full pipeline", async () => {
    patchSettings({ torrentCoversEnabled: true });
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") return [NARUTO_MEDIA];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const { container } = renderRow();
    await waitFor(() => {
      const img = container.querySelector('img[src*="asset.localhost"]');
      expect(img).not.toBeNull();
    });
  });

  it("renders the remote url while bytes download instead of the fallback", async () => {
    patchSettings({ torrentCoversEnabled: true });
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") return [NARUTO_MEDIA];
      if (command === "download_remote_image") return new Promise(() => {});
      return null;
    });
    const { container } = renderRow();
    await waitFor(() => {
      const img = container.querySelector('img[src*="s4.anilist.co"]');
      expect(img).not.toBeNull();
    });
    expect(container.querySelector('img[src*="unknown_source"]')).toBeNull();
  });

  it("renders the fallback only when nothing resolves", async () => {
    patchSettings({ torrentCoversEnabled: true });
    mockInvoke.mockImplementation(async () => null);
    const { container } = renderRow();
    await waitFor(
      () => {
        const img = container.querySelector('img[src*="unknown_source"]');
        expect(img).not.toBeNull();
      },
      { timeout: 5000 }
    );
  });

  it("opens details from the title and refetches the cover from the thumbnail", async () => {
    patchSettings({ torrentCoversEnabled: true });
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") return [NARUTO_MEDIA];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const onOpenDetails = vi.fn();
    const { container } = renderRow({ onOpenDetails });
    await waitFor(() => {
      expect(container.querySelector('img[src*="asset.localhost"]')).not.toBeNull();
    });
    const user = userEvent.setup();
    await user.click(screen.getByText(ITEM.title));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[aria-label="More"]')).toBeNull();
    mockInvoke.mockClear();
    await user.click(screen.getByRole("button", { name: "Refresh cover" }));
    await waitFor(() => {
      expect(mockInvoke.mock.calls.some(([command]) => command === "search_anilist")).toBe(true);
    });
  });
});
