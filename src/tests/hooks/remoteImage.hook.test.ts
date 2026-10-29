import { mockInvoke as invokeMock } from "../mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  prefetchRemoteImages,
  resetRemoteImageCache,
  STREAM_COVER_REFERER,
  toSizedThumbUrl,
  useRemoteImageStatus,
  useStreamCover,
} from "@/hooks/remoteImage.hook";
import { assetUrl } from "@/lib/utils/image.utils";
import { patchSettings } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  invokeMock.mockReset();
  resetRemoteImageCache();
  patchSettings({ tmdbProxyUrl: null });
});

describe("toSizedThumbUrl", () => {
  it("rewrites tmdb w500 to w92 and leaves other urls alone", () => {
    expect(toSizedThumbUrl("https://image.tmdb.org/t/p/w500/abc.jpg")).toBe(
      "https://image.tmdb.org/t/p/w92/abc.jpg"
    );
    expect(toSizedThumbUrl("https://image.tmdb.org/t/p/w780/abc.jpg")).toBe(
      "https://image.tmdb.org/t/p/w92/abc.jpg"
    );
    expect(toSizedThumbUrl("https://example.com/cover.jpg")).toBe("https://example.com/cover.jpg");
  });
});

describe("prefetchRemoteImages", () => {
  it("warms the memory cache so a later hook mount needs no invoke", async () => {
    invokeMock.mockResolvedValue({ id: "blob-1", path: "C:/images/blob-1.jpg" });
    prefetchRemoteImages(["https://image.tmdb.org/t/p/w500/dune.jpg"]);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "fetch_remote_image",
      expect.objectContaining({ url: "https://image.tmdb.org/t/p/w92/dune.jpg" })
    );
    await waitFor(() => {
      const { result, unmount } = renderHook(() =>
        useRemoteImageStatus("https://image.tmdb.org/t/p/w92/dune.jpg")
      );
      expect(result.current.src).toBe(assetUrl("C:/images/blob-1.jpg"));
      expect(result.current.failed).toBe(false);
      unmount();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes the same url prefetched twice", async () => {
    invokeMock.mockResolvedValue({ id: "blob-dedupe", path: "C:/images/dedupe.jpg" });
    prefetchRemoteImages(["https://example.com/dedupe.jpg", "https://example.com/dedupe.jpg"]);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
  });

  it("starts at most 2 fetches at once and drains the queue", async () => {
    const resolvers = new Map<string, (value: { id: string; path: string }) => void>();
    invokeMock.mockImplementation((_cmd: string, args: { url: string }) => {
      return new Promise<{ id: string; path: string }>((resolve) => {
        resolvers.set(args.url, resolve);
      });
    });
    const urls = [
      "https://example.com/q-0.jpg",
      "https://example.com/q-1.jpg",
      "https://example.com/q-2.jpg",
      "https://example.com/q-3.jpg",
      "https://example.com/q-4.jpg",
    ];
    prefetchRemoteImages(urls);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    resolvers.get("https://example.com/q-0.jpg")?.({ id: "q-0", path: "C:/images/q-0.jpg" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(3);
    });
    for (const url of urls.slice(1)) {
      resolvers.get(url)?.({ id: url, path: `C:/images/${url.slice(-7)}` });
    }
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(5);
    });
  });

  it("skips nullish urls without invoking", () => {
    prefetchRemoteImages([null, undefined, ""]);
    expect(invokeMock).not.toHaveBeenCalled();
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
    patchSettings({ anilistProxyUrl: null });
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
