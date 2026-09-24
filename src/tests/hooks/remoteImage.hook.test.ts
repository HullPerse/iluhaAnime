import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  prefetchRemoteImages,
  resetRemoteImageCache,
  toSizedThumbUrl,
  useRemoteImageStatus,
} from "@/hooks/remoteImage.hook";
import { assetUrl } from "@/lib/utils/image.utils";
import { useSettingsStore } from "@/store/settings.store";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  invokeMock.mockReset();
  resetRemoteImageCache();
  useSettingsStore.setState({ tmdbProxyUrl: null });
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
    prefetchRemoteImages([
      "https://example.com/dedupe.jpg",
      "https://example.com/dedupe.jpg",
    ]);
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
