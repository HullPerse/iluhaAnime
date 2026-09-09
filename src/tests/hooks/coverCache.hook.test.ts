import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COVER_CACHE_CAPACITY } from "@/hooks/collection/cache.hook";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { useCoverCache } from "@/hooks/collection/cache.hook";
import { assetUrl } from "@/lib/utils/image.utils";
import { useSettingsStore } from "@/store/settings.store";

let resolveGate!: (value: { id: string; path: string }) => void;
beforeEach(() => {
  invokeMock.mockReset();
});

describe("useCoverCache", () => {
  it("dedupes concurrent downloads of the same url", async () => {
    invokeMock.mockReturnValue(
      new Promise<{ id: string; path: string }>((resolve) => {
        resolveGate = resolve;
      })
    );

    const first = renderHook(() => useCoverCache("https://example.com/dedupe.jpg", null));
    const second = renderHook(() => useCoverCache("https://example.com/dedupe.jpg", null));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    resolveGate({ id: "blob-1", path: "C:/images/blob-1.png" });
    const coverUrl = assetUrl("C:/images/blob-1.png");
    await waitFor(() => {
      expect(first.result.current.cachedUrl).toBe(coverUrl);
      expect(second.result.current.cachedUrl).toBe(coverUrl);
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  it("serves later mounts from memory without a new invoke", async () => {
    invokeMock.mockResolvedValue({ id: "blob-2", path: "C:/images/blob-2.png" });
    const first = renderHook(() => useCoverCache("https://example.com/mem.jpg", null));
    await waitFor(() => {
      expect(first.result.current.cachedUrl).toBe(assetUrl("C:/images/blob-2.png"));
    });
    first.unmount();

    invokeMock.mockClear();
    const second = renderHook(() => useCoverCache("https://example.com/mem.jpg", null));
    expect(second.result.current.cachedUrl).toBe(assetUrl("C:/images/blob-2.png"));
    expect(invokeMock).not.toHaveBeenCalled();
    second.unmount();
  });

  it("falls back to the remote url when the download fails", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(() =>
      useCoverCache("https://example.com/offline.jpg", null)
    );
    await waitFor(() => {
      expect(result.current.cachedUrl).toBe("https://example.com/offline.jpg");
    });
    unmount();
  });

  it("re-downloads an evicted cover after the LRU capacity is reached", async () => {
    const coverPath = (url: string) => `C:/images/${url.slice(url.lastIndexOf("/") + 1)}`;
    invokeMock.mockImplementation((_command: string, args: { url: string }) =>
      Promise.resolve({ id: `blob-${args.url}`, path: coverPath(args.url) })
    );
    const hooks: { result: { current: { cachedUrl: string | null } }; unmount: () => void }[] = [];
    for (let i = 0; i <= COVER_CACHE_CAPACITY + 5; i++) {
      const hook = renderHook(() => useCoverCache(`https://example.com/fill-${i}.jpg`, null));
      hooks.push(hook);
    }
    await waitFor(() => {
      expect(hooks.at(-1)?.result.current.cachedUrl).toBe(
        assetUrl(coverPath(`https://example.com/fill-${COVER_CACHE_CAPACITY + 5}.jpg`))
      );
    });
    for (const hook of hooks) hook.unmount();

    invokeMock.mockClear();
    invokeMock.mockImplementation((_command: string, args: { url: string }) =>
      Promise.resolve({ id: `blob-${args.url}`, path: coverPath(args.url) })
    );
    const remounted = renderHook(() => useCoverCache("https://example.com/fill-0.jpg", null));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
    remounted.unmount();
  });
});

describe("useCoverCache proxy passthrough", () => {
  it("passes the tmdb proxy url to the download command", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:9/proxy" });
    invokeMock.mockResolvedValue({ id: "blob-proxy", path: "C:/images/proxy.png" });

    const { result, unmount } = renderHook(() =>
      useCoverCache("https://image.tmdb.org/t/p/w500/cover.jpg", null)
    );
    await waitFor(() => {
      expect(result.current.cachedUrl).toBe(assetUrl("C:/images/proxy.png"));
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "download_remote_image",
      expect.objectContaining({ proxyUrl: "http://127.0.0.1:9/proxy" })
    );
    unmount();
    useSettingsStore.setState({ tmdbProxyUrl: null });
  });

  it("sends a null proxy when none is configured", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: null });
    invokeMock.mockResolvedValue({ id: "blob-noproxy", path: "C:/images/noproxy.png" });

    const { result, unmount } = renderHook(() =>
      useCoverCache("https://example.com/plain.jpg", null)
    );
    await waitFor(() => {
      expect(result.current.cachedUrl).toBe(assetUrl("C:/images/noproxy.png"));
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "download_remote_image",
      expect.objectContaining({ proxyUrl: null })
    );
    unmount();
  });
});
