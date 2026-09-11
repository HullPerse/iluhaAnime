import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHostStats } from "@/hooks/hostStats.hook";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const STATS = {
  cpuUsage: 12.5,
  memoryUsed: 3_221_225_472,
  memoryTotal: 17_179_869_184,
  netRxBps: 1024,
  netTxBps: 512,
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("useHostStats", () => {
  it("returns null without invoking when disabled", () => {
    const { result, unmount } = renderHook(() => useHostStats(false));
    expect(result.current).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    unmount();
  });

  it("polls get_host_stats and returns the payload when enabled", async () => {
    invokeMock.mockResolvedValue(STATS);
    const { result, unmount } = renderHook(() => useHostStats(true));
    await waitFor(() => {
      expect(result.current).toEqual(STATS);
    });
    expect(invokeMock).toHaveBeenCalledWith("get_host_stats", undefined);
    unmount();
  });

  it("returns null when the backend call fails", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(() => useHostStats(true));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    expect(result.current).toBeNull();
    unmount();
  });

  it("re-invokes on the interval and stops after unmount", async () => {
    vi.useFakeTimers();
    try {
      invokeMock.mockResolvedValue(STATS);
      const { unmount } = renderHook(() => useHostStats(true));
      await vi.advanceTimersByTimeAsync(0);
      expect(invokeMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(invokeMock).toHaveBeenCalledTimes(2);
      unmount();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(invokeMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off after a failure instead of retrying every tick", async () => {
    vi.useFakeTimers();
    try {
      invokeMock.mockRejectedValue(new Error("offline"));
      const { unmount } = renderHook(() => useHostStats(true));
      await vi.advanceTimersByTimeAsync(0);
      expect(invokeMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(invokeMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4000);
      expect(invokeMock).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
