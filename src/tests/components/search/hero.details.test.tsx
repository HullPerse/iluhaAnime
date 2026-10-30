import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DetailsHero from "@/routes/components/search/default/details/hero.details";
import { patchSettings } from "@/store/settings.store";
import type { Anime, TorrentView } from "@/types/torrent/torrent";

import { mockDialogSave, mockInvoke, mockWriteText } from "@/tests/mocks";

const REMOTE_POSTER = "https://cdn.example.com/covers/123.jpg";
const ASSET_POSTER = "https://asset.localhost/C%3A/covers/123.jpg";

const view = (): TorrentView => {
  return {
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
    screenshots: [],
    poster: null,
    mediainfo: null,
    author: "uploader",
    descriptionBlocks: [],
    comments: [],
    notice: null,
  };
};

const item = (): Anime => {
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
};

const renderHero = (poster: string) => {
  const noop = () => undefined;
  render(
    <DetailsHero
      view={view()}
      item={item()}
      source="nyaa"
      busy={false}
      poster={poster}
      onCopyMagnet={noop}
      onOpenMagnet={noop}
      onDownload={noop}
      onOpenOriginal={noop}
      onZoom={noop}
    />
  );
};

const posterButton = (): HTMLElement => {
  const button = screen.getByRole("button", { name: "Open image" });
  return button;
};

const pngBlob = (): Blob => {
  return new Blob(["fakepng"], { type: "image/png" });
};

const stubImagePipeline = (blob: Blob = pngBlob()) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, blob: async () => blob }) as Response)
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 4, height: 4, close: vi.fn() }))
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: (blob: Blob | null) => void) => {
      callback(pngBlob());
    }
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { write: vi.fn(async () => undefined) },
    configurable: true,
  });
  vi.stubGlobal(
    "ClipboardItem",
    class ClipboardItem {
      parts: unknown;
      constructor(parts: unknown) {
        this.parts = parts;
      }
    }
  );
};

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DetailsHero poster menu", () => {
  it("opens three entries on a remote poster", async () => {
    renderHero(REMOTE_POSTER);
    fireEvent.contextMenu(posterButton());

    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(3));
    expect(screen.getByRole("menuitem", { name: "Save image as..." })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Copy image" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Copy image URL" })).not.toBeNull();
  });

  it("hides the URL copy on an asset poster", async () => {
    renderHero(ASSET_POSTER);
    fireEvent.contextMenu(posterButton());

    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(2));
    expect(screen.queryByRole("menuitem", { name: "Copy image URL" })).toBeNull();
  });

  it("copies the poster URL", async () => {
    renderHero(REMOTE_POSTER);
    fireEvent.contextMenu(posterButton());

    await waitFor(() => screen.getByRole("menuitem", { name: "Copy image URL" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Copy image URL" }));

    expect(mockWriteText).toHaveBeenCalledWith(REMOTE_POSTER);
  });

  it("copies the poster bitmap", async () => {
    stubImagePipeline();
    renderHero(REMOTE_POSTER);
    fireEvent.contextMenu(posterButton());

    await waitFor(() => screen.getByRole("menuitem", { name: "Copy image" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Copy image" }));

    await waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledTimes(1));
  });

  it("saves through the dialog and the poster command", async () => {
    stubImagePipeline();
    mockDialogSave.mockResolvedValue("/tmp/poster.png");
    mockInvoke.mockResolvedValue("/tmp/poster.png");
    renderHero(REMOTE_POSTER);
    fireEvent.contextMenu(posterButton());

    await waitFor(() => screen.getByRole("menuitem", { name: "Save image as..." }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save image as..." }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_poster_bytes",
        expect.objectContaining({ path: "/tmp/poster.png" })
      )
    );
    const args = mockInvoke.mock.calls[0]?.[1] as { data: number[] };
    expect(args.data.length).toBeGreaterThan(0);
  });

  it("skips the command when the dialog is cancelled", async () => {
    stubImagePipeline();
    mockDialogSave.mockResolvedValue(null);
    renderHero(REMOTE_POSTER);
    fireEvent.contextMenu(posterButton());

    await waitFor(() => screen.getByRole("menuitem", { name: "Save image as..." }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save image as..." }));

    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
