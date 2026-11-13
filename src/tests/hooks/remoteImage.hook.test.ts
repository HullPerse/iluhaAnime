import { mockInvoke as invokeMock } from "@/tests/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  prefetchRemoteImages,
  resetRemoteImageCache,
  setRemoteImageScope,
  STREAM_COVER_REFERER,
  useRemoteImageStatus,
  useStreamCover,
} from "@/hooks/remoteImage.hook";
import { assetUrl } from "@/lib/graphics/image.utils";
import { patchSettings } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  invokeMock.mockReset();
  patchSettings({ anilistProxyUrl: null });
  resetRemoteImageCache();
});

describe("prefetchRemoteImages", () => {
  it("warms the memory cache with one batch call so a later hook mount needs no invoke", async () => {
    invokeMock.mockResolvedValue([{ id: "blob-1", path: "C:/images/blob-1.jpg" }]);
    await prefetchRemoteImages(["https://example.com/dune.jpg"]);
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote_images", {
      urls: ["https://example.com/dune.jpg"],
      proxyUrl: undefined,
    });

    const { result, unmount } = renderHook(() =>
      useRemoteImageStatus("https://example.com/dune.jpg")
    );
    expect(result.current.src).toBe(assetUrl("C:/images/blob-1.jpg"));
    expect(result.current.failed).toBe(false);
    unmount();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes the same url prefetched twice", async () => {
    invokeMock.mockResolvedValue([{ id: "blob-dedupe", path: "C:/images/dedupe.jpg" }]);
    await prefetchRemoteImages([
      "https://example.com/dedupe.jpg",
      "https://example.com/dedupe.jpg",
    ]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({
      urls: ["https://example.com/dedupe.jpg"],
      proxyUrl: undefined,
    });
  });

  it("sends low-priority prefetches in batches of eight", async () => {
    invokeMock.mockImplementation((_command: string, args: { urls: string[] }) =>
      Promise.resolve(
        args.urls.map((url, index) => ({ id: url, path: `C:/images/batch-${index}.jpg` }))
      )
    );
    const urls = Array.from({ length: 18 }, (_, index) => `https://example.com/batch-${index}.jpg`);

    await prefetchRemoteImages(urls);

    const batchSizes = invokeMock.mock.calls.map(
      (call) => (call[1] as { urls: string[] }).urls.length
    );
    expect(batchSizes).toEqual([8, 8, 2]);
  });

  it("passes the configured AniList proxy to visible card art", async () => {
    patchSettings({ anilistProxyUrl: "socks5://127.0.0.1:10808" });
    invokeMock.mockResolvedValue({ id: "card-1", path: "C:/images/card-1.jpg" });
    const { result, unmount } = renderHook(() =>
      useRemoteImageStatus("https://s4.anilist.co/file/anilistcdn/card.jpg")
    );

    await waitFor(() => {
      expect(result.current.src).toBe(assetUrl("C:/images/card-1.jpg"));
    });
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote_image", {
      url: "https://s4.anilist.co/file/anilistcdn/card.jpg",
      proxyUrl: "socks5://127.0.0.1:10808",
    });
    unmount();
  });

  it("drops queued prefetches outside the active screen scope", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const urls = Array.from({ length: 40 }, (_, index) => `https://example.com/scope-${index}.jpg`);
    const prefetching = prefetchRemoteImages(urls);
    expect(invokeMock).toHaveBeenCalledTimes(4);

    setRemoteImageScope([urls[0] as string]);
    for (const resolve of resolvers) resolve([]);
    await prefetching;

    expect(invokeMock).toHaveBeenCalledTimes(4);
  });

  it("runs a visible card before queued prefetches", async () => {
    const lowResolvers: Array<(value: unknown) => void> = [];
    invokeMock.mockImplementation((command: string) => {
      if (command === "fetch_remote_images") {
        return new Promise((resolve) => {
          lowResolvers.push(resolve);
        });
      }
      return Promise.resolve({ id: "high", path: "C:/images/high.jpg" });
    });
    const urls = Array.from({ length: 32 }, (_, index) => `https://example.com/priority-${index}.jpg`);
    const prefetching = prefetchRemoteImages(urls);
    expect(invokeMock).toHaveBeenCalledTimes(4);

    const { result, unmount } = renderHook(() =>
      useRemoteImageStatus("https://example.com/high.jpg")
    );
    expect(result.current.src).toBeNull();

    lowResolvers.shift()?.([]);
    await waitFor(() => {
      expect(result.current.src).toBe(assetUrl("C:/images/high.jpg"));
    });
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote_image", {
      url: "https://example.com/high.jpg",
      proxyUrl: undefined,
    });

    for (const resolve of lowResolvers) resolve([]);
    await prefetching;
    unmount();
  });
});

describe("useStreamCover", () => {
  it("downloads the cover through the cache with the AnimeLib referer", async () => {
    invokeMock.mockResolvedValue({ id: "cover-1", path: "C:/images/cover-1.jpg" });
    const { result, unmount } = renderHook(() =>
      useStreamCover("https://cover.imglib.info/uploads/anime/1/cover.jpg")
    );
    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current).toBe(assetUrl("C:/images/cover-1.jpg"));
    });
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote_image", {
      url: "https://cover.imglib.info/uploads/anime/1/cover.jpg",
      referer: STREAM_COVER_REFERER,
    });
    unmount();
  });

  it("fetches an AniList preview through the AniList proxy without a referer", async () => {
    patchSettings({ anilistProxyUrl: "socks5://127.0.0.1:10808" });
    invokeMock.mockResolvedValue({ id: "preview-1", path: "C:/images/preview-1.jpg" });
    const { result, unmount } = renderHook(() =>
      useStreamCover("https://img1.ak.crunchyroll.com/i/spire1/episode-1.jpg")
    );

    await waitFor(() => {
      expect(result.current).toBe(assetUrl("C:/images/preview-1.jpg"));
    });
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote_image", {
      url: "https://img1.ak.crunchyroll.com/i/spire1/episode-1.jpg",
      proxyUrl: "socks5://127.0.0.1:10808",
    });
    unmount();
  });

  it("does not download one cover twice and stays empty for a missing url", async () => {
    invokeMock.mockResolvedValue({ id: "cover-2", path: "C:/images/cover-2.jpg" });
    const url = "https://cover.imglib.info/uploads/anime/2/cover.jpg";
    const first = renderHook(() => useStreamCover(url));
    const second = renderHook(() => useStreamCover(url));
    await waitFor(() => {
      expect(first.result.current).toBe(assetUrl("C:/images/cover-2.jpg"));
      expect(second.result.current).toBe(assetUrl("C:/images/cover-2.jpg"));
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();

    const missing = renderHook(() => useStreamCover(null));
    expect(missing.result.current).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    missing.unmount();
  });
});
