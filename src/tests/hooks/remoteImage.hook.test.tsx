import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRemoteImage, useRemoteImageStatus } from "@/hooks/remoteImage.hook";
import { useSettingsStore } from "@/store/settings.store";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ tmdbProxyUrl: null });
});

describe("useRemoteImage", () => {
  it("returns the remote url without invoking when no proxy is set", () => {
    const { result, unmount } = renderHook(() =>
      useRemoteImage("https://image.tmdb.org/t/p/w500/a.jpg")
    );
    expect(result.current).toBe("https://image.tmdb.org/t/p/w500/a.jpg");
    expect(invokeMock).not.toHaveBeenCalled();
    unmount();
  });

  it("resolves through the backend cache when a proxy is set", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:10809" });
    invokeMock.mockResolvedValue({ id: "cached-1", path: "C:/images/cached-1.jpg" });
    const { result, unmount } = renderHook(() =>
      useRemoteImage("https://image.tmdb.org/t/p/w500/a.jpg")
    );
    await waitFor(() => {
      expect(result.current).toContain("http://asset.localhost/");
    });
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote_image", {
      url: "https://image.tmdb.org/t/p/w500/a.jpg",
      proxyUrl: "http://127.0.0.1:10809",
    });
    unmount();
  });

  it("returns null without invoking for empty urls", () => {
    const { result, unmount } = renderHook(() => useRemoteImage(null));
    expect(result.current).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    unmount();
  });

  it("returns null when the backend fetch fails", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:10809" });
    invokeMock.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(() =>
      useRemoteImage("https://image.tmdb.org/t/p/w500/offline.jpg")
    );
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current).toBeNull();
    unmount();
  });
});

describe("useRemoteImageStatus", () => {
  it("reports failure when the backend fetch fails", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:10809" });
    invokeMock.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(() =>
      useRemoteImageStatus("https://image.tmdb.org/t/p/w500/gone.jpg")
    );
    await waitFor(() => {
      expect(result.current.failed).toBe(true);
    });
    expect(result.current.src).toBeNull();
    unmount();
  });
});
