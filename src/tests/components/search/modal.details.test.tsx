import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "../../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@/api/torrent.api", () => ({
  torrentApi: {
    getTorrentDetails: vi.fn(),
  },
}));

vi.mock("@/hooks/search/cover.hook", () => ({
  useTorrentCover: () => ({
    status: "empty",
    coverUrl: null,
    remoteUrl: null,
    anilistId: null,
    candidates: [],
    coverKey: "test",
  }),
}));

import { torrentApi } from "@/api/torrent.api";
import TorrentDetailsModal from "@/routes/components/search/default/details/modal.details";
import { patchSettings } from "@/store/settings.store";
import type { Anime, TorrentDetails } from "@/types/torrent";

const DESC_ONE = "https://cdn.example.com/desc-1.jpg";
const DESC_TWO = "https://cdn.example.com/desc-2.jpg";
const SHOT_ONE = "https://cdn.example.com/shot-1.jpg";
const SHOT_TWO = "https://cdn.example.com/shot-2.jpg";

const DETAILS: TorrentDetails = {
  source: "nyaa",
  url: "https://example.com/torrent/1",
  title: "Show S01E01",
  description: "",
  category: "Anime",
  size: "1.4 GiB",
  uploadedAt: "2026-01-01",
  updatedAt: "2026-01-02",
  seeders: 10,
  leechers: 1,
  completed: 5,
  downloads: 0,
  infoHash: "abc",
  magnet: "magnet:?xt=1",
  torrentUrl: "https://example.com/1.torrent",
  fields: [],
  files: [],
  screenshots: [SHOT_ONE, SHOT_TWO],
  poster: "https://cdn.example.com/poster.jpg",
  mediainfo: null,
  author: "uploader",
  descriptionBlocks: [
    { kind: "image", src: DESC_ONE },
    { kind: "text", text: "middle" },
    { kind: "image", src: DESC_TWO },
  ],
  comments: [],
  notice: null,
};

function item(): Anime {
  return {
    title: "Show",
    magnet: "magnet:?xt=1",
    torrent: "https://example.com/1.torrent",
    size: "1.4 GiB",
    seeders: 10,
    leechers: 1,
    category: "Anime",
    link: "https://example.com/torrent/1",
  };
}

function renderDetails() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TorrentDetailsModal
        item={item()}
        source="nyaa"
        magnets={{}}
        loadingMagnet={{}}
        onClose={() => undefined}
        onCopyMagnet={() => undefined}
        onOpenMagnet={() => undefined}
        onDownload={() => undefined}
      />
    </QueryClientProvider>
  );
}

function imageAt(src: string): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>(`img[src="${src}"]`);
}

async function openImage(user: ReturnType<typeof userEvent.setup>, src: string) {
  const img = await waitFor(() => {
    const found = imageAt(src);
    if (!found) throw new Error(`image not rendered: ${src}`);
    return found;
  });
  const button = img.closest("button");
  if (!button) throw new Error(`image is not zoomable: ${src}`);
  await user.click(button);
}

beforeEach(() => {
  patchSettings({ language: "en", modalAnimation: false });
  mockInvoke.mockReset();
  vi.mocked(torrentApi.getTorrentDetails).mockReset();
  vi.mocked(torrentApi.getTorrentDetails).mockResolvedValue(DETAILS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Torrent details image lightbox", () => {
  it("pages through the description images from the clicked one", async () => {
    const user = userEvent.setup();
    renderDetails();

    await openImage(user, DESC_ONE);

    expect(imageAt(DESC_ONE)).not.toBeNull();
    expect(screen.getByText("1 / 2")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(imageAt(DESC_TWO)).not.toBeNull();
    expect(imageAt(SHOT_TWO)).toBeNull();
    expect(screen.getByText("2 / 2")).not.toBeNull();
  });

  it("pages through screenshots from the screenshots tab", async () => {
    const user = userEvent.setup();
    renderDetails();

    await user.click(await screen.findByRole("tab", { name: /Screenshots/ }));
    await openImage(user, SHOT_ONE);

    expect(screen.getByText("1 / 2")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Previous" }));

    expect(imageAt(SHOT_TWO)).not.toBeNull();
    expect(imageAt(SHOT_ONE)).toBeNull();
  });

  it("does not offer paging for a single description image", async () => {
    const user = userEvent.setup();
    const solo: TorrentDetails = {
      ...DETAILS,
      screenshots: [],
      descriptionBlocks: [{ kind: "image", src: DESC_ONE }],
    };
    vi.mocked(torrentApi.getTorrentDetails).mockResolvedValueOnce(solo);
    renderDetails();

    await openImage(user, DESC_ONE);

    expect(screen.queryByText("1 / 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});
