import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COVER_CACHE_CAPACITY } from "@/hooks/collection/cache.hook";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useCoverCache } from "@/hooks/collection/cache.hook";

let resolveGate!: (value: { id: string; dataUrl: string }) => void;
beforeEach(() => {
  invokeMock.mockReset();
});

describe("useCoverCache", () => {
  it("dedupes concurrent downloads of the same url", async () => {
    invokeMock.mockReturnValue(
      new Promise<{ id: string; dataUrl: string }>((resolve) => {
        resolveGate = resolve;
      })
    );

    const first = renderHook(() => useCoverCache("https://example.com/dedupe.jpg", null));
    const second = renderHook(() => useCoverCache("https://example.com/dedupe.jpg", null));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    resolveGate({ id: "blob-1", dataUrl: "data:image/png;base64,cover" });
    await waitFor(() => {
      expect(first.result.current.cachedUrl).toBe("data:image/png;base64,cover");
      expect(second.result.current.cachedUrl).toBe("data:image/png;base64,cover");
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  it("serves later mounts from memory without a new invoke", async () => {
    invokeMock.mockResolvedValue({ id: "blob-2", dataUrl: "data:image/png;base64,mem" });
    const first = renderHook(() => useCoverCache("https://example.com/mem.jpg", null));
    await waitFor(() => {
      expect(first.result.current.cachedUrl).toBe("data:image/png;base64,mem");
    });
    first.unmount();

    invokeMock.mockClear();
    const second = renderHook(() => useCoverCache("https://example.com/mem.jpg", null));
    expect(second.result.current.cachedUrl).toBe("data:image/png;base64,mem");
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
    invokeMock.mockImplementation((_command: string, args: { url: string }) =>
      Promise.resolve({ id: `blob-${args.url}`, dataUrl: `data:image/png;base64,${args.url}` })
    );
    const hooks: { result: { current: { cachedUrl: string | null } }; unmount: () => void }[] = [];
    for (let i = 0; i <= COVER_CACHE_CAPACITY + 5; i++) {
      const hook = renderHook(() => useCoverCache(`https://example.com/fill-${i}.jpg`, null));
      hooks.push(hook);
    }
    await waitFor(() => {
      expect(hooks.at(-1)?.result.current.cachedUrl).toBe(
        `data:image/png;base64,https://example.com/fill-${COVER_CACHE_CAPACITY + 5}.jpg`
      );
    });
    for (const hook of hooks) hook.unmount();

    invokeMock.mockClear();
    invokeMock.mockImplementation((_command: string, args: { url: string }) =>
      Promise.resolve({ id: `blob-${args.url}`, dataUrl: `data:image/png;base64,${args.url}` })
    );
    const remounted = renderHook(() => useCoverCache("https://example.com/fill-0.jpg", null));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
    remounted.unmount();
  });
});
