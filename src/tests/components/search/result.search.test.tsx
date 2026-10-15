import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchResultItem from "@/routes/components/search/default/result.search";
import { coverCorrectionsAtoms, removeResolvedCover } from "@/store/cover.store";
import { patchSettings } from "@/store/settings.store";
import type { Anime } from "@/types/torrent";

import { mockInvoke } from "../../mocks";

vi.mock("@tauri-apps/api/core", async () => {
  const { mockInvoke: invoke } = await import("../../mocks");
  return {
    invoke,
    convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
  };
});

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

function renderRow(
  handlers?: { onOpenDetails?: (item: Anime) => void },
  item: Anime = ITEM,
  source = "erai-raws"
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchResultItem
        item={item}
        source={source}
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

const RUTRACKER_ITEM: Anime = {
  ...ITEM,
  link: "https://rutracker.org/forum/viewtopic.php?t=1",
};

afterEach(() => {
  cleanup();
  removeResolvedCover("naruto|0");
  coverCorrectionsAtoms.blobs.set({});
  patchSettings({ torrentCoverMode: "off" });
});

beforeEach(() => {
  mockInvoke.mockReset();
});

function mockCoverPipeline() {
  patchSettings({ torrentCoverMode: "full" });
  mockInvoke.mockImplementation(async (command: unknown) => {
    if (command === "search_anilist") return [NARUTO_MEDIA];
    if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
    if (command === "get_user_image") return { id: "blob1", path: "covers/naruto.jpg" };
    return null;
  });
}

describe("SearchResultItem keyboard surface", () => {
  it("exposes the title as a hintable title button", () => {
    patchSettings({ torrentCoverMode: "off" });
    const onOpenDetails = vi.fn();
    renderRow({ onOpenDetails });

    const title = screen.getByRole("button", { name: ITEM.title });
    expect(title.tagName).toBe("BUTTON");
    expect(title.dataset.vimTarget).toBe("result-title");

    fireEvent.click(title);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("opens cover correction from the refresh button context menu", async () => {
    mockCoverPipeline();
    const { container } = renderRow();
    await waitFor(
      () => {
        expect(container.querySelector('img[src*="asset.localhost"]')).not.toBeNull();
      },
      { timeout: 5000 }
    );

    const refresh = screen.getByRole("button", { name: "Refresh cover" });
    expect(refresh.dataset.vimContextmenu).toBe("cover");
    expect(refresh.querySelector("img")).not.toBeNull();

    fireEvent.contextMenu(refresh);
    expect(screen.getByText("Wrong cover?")).toBeDefined();
  });
});

describe("SearchResultItem covers", () => {
  it("renders no thumbnail while the setting is off and fires no cover queries", async () => {
    patchSettings({ torrentCoverMode: "off" });
    const { container } = renderRow();
    await waitFor(() => expect(screen.getByText(ITEM.title)).toBeDefined());
    const cover = container.querySelector(
      'img[src*="unknown_source"], img[src*="asset.localhost"]'
    );
    expect(cover).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "search_anilist")).toBe(false);
  });

  it("resolves and renders the cover through the full pipeline", async () => {
    patchSettings({ torrentCoverMode: "full" });
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") return [NARUTO_MEDIA];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      if (command === "get_user_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const { container } = renderRow();
    await waitFor(
      () => {
        const img = container.querySelector('img[src*="asset.localhost"]');
        expect(img).not.toBeNull();
      },
      { timeout: 5000 }
    );
  });

  it("renders the remote url while bytes download instead of the fallback", async () => {
    patchSettings({ torrentCoverMode: "full" });
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
    patchSettings({ torrentCoverMode: "full" });
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
    patchSettings({ torrentCoverMode: "full" });
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") return [NARUTO_MEDIA];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      if (command === "get_user_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const onOpenDetails = vi.fn();
    const { container } = renderRow({ onOpenDetails });
    await waitFor(
      () => {
        expect(container.querySelector('img[src*="asset.localhost"]')).not.toBeNull();
      },
      { timeout: 5000 }
    );
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

  it("shows the tracker page poster in pages mode without AniList search", async () => {
    patchSettings({ torrentCoverMode: "pages" });
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "get_torrent_details")
        return { poster: "https://img.rutracker.org/f/009/poster.jpg" };
      if (command === "download_remote_image") return { id: "blob2", path: "covers/rt.jpg" };
      if (command === "get_user_image") return { id: "blob2", path: "covers/rt.jpg" };
      return null;
    });
    const { container } = renderRow(undefined, RUTRACKER_ITEM, "rutracker");
    await waitFor(
      () => {
        expect(container.querySelector("img")).not.toBeNull();
      },
      { timeout: 5000 }
    );
    expect(container.querySelector('img[src*="unknown_source"]')).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "search_anilist")).toBe(false);
  });

  it("hides the thumbnail slot in pages mode when the page has no poster", async () => {
    patchSettings({ torrentCoverMode: "pages" });
    mockInvoke.mockImplementation(async () => null);
    const { container } = renderRow(undefined, RUTRACKER_ITEM, "rutracker");
    await waitFor(
      () => {
        expect(container.querySelector(".animate-pulse")).toBeNull();
      },
      { timeout: 5000 }
    );
    expect(container.querySelector("img")).toBeNull();
    expect(mockInvoke.mock.calls.some(([command]) => command === "search_anilist")).toBe(false);
  });
});
