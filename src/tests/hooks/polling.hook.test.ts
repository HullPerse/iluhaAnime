import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolling } from "@/hooks/polling.hook";

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPoller(options: {
    intervalMs?: number;
    enabled?: boolean;
    ids: () => number[];
    shouldFetch?: (id: number) => boolean;
    fetch?: (id: number) => Promise<boolean>;
    onStart?: (id: number) => void;
    onSettle?: (id: number) => void;
  }) {
    const fetch = options.fetch ?? vi.fn().mockResolvedValue(true);
    return {
      fetch,
      render: renderHook(() =>
        usePolling({
          intervalMs: options.intervalMs ?? 1000,
          enabled: options.enabled,
          collectKeys: options.ids,
          shouldFetch: options.shouldFetch ?? (() => true),
          fetch,
          onStart: options.onStart,
          onSettle: options.onSettle,
        })
      ),
    };
  }

  it("sweeps immediately on mount and then on the interval", async () => {
    const holder = { ids: [1, 2] };
    const { fetch, render } = renderPoller({ ids: () => holder.ids });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(1);
    expect(fetch).toHaveBeenCalledWith(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(8);
    render.unmount();
  });

  it("keeps at most one fetch in flight per key", async () => {
    let finishFetch!: (ok: boolean) => void;
    const holder = { ids: [7] };
    const { fetch, render } = renderPoller({
      ids: () => holder.ids,
      fetch: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishFetch = resolve;
          })
      ),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);

    finishFetch(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    render.unmount();
  });

  it("backs off exponentially after a failed fetch", async () => {
    const holder = { ids: [1] };
    const { fetch, render } = renderPoller({
      ids: () => holder.ids,
      fetch: vi.fn().mockResolvedValue(false),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).toHaveBeenCalledTimes(3);
    render.unmount();
  });

  it("treats a rejected fetch as a failure and backs off", async () => {
    const holder = { ids: [3] };
    const { fetch, render } = renderPoller({
      ids: () => holder.ids,
      fetch: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    render.unmount();
  });

  it("clears the backoff on success so later failures restart from the base delay", async () => {
    const holder = { ids: [1] };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { render } = renderPoller({ ids: () => holder.ids, fetch });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(5);
    render.unmount();
  });

  it("respects the shouldFetch gate on every sweep", async () => {
    const holder = { ready: true };
    const fetch = vi.fn().mockResolvedValue(true);
    const { render } = renderPoller({
      ids: () => [9],
      shouldFetch: () => holder.ready,
      fetch,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    holder.ready = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(1);
    render.unmount();
  });

  it("reports start and settle around each fetch", async () => {
    const holder = { ids: [5] };
    const onStart = vi.fn();
    const onSettle = vi.fn();
    const { fetch, render } = renderPoller({
      ids: () => holder.ids,
      onStart,
      onSettle,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onStart).toHaveBeenCalledWith(5);
    expect(onSettle).toHaveBeenCalledWith(5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    render.unmount();
  });

  it("sweeps only while enabled and resumes on the next enable", async () => {
    const holder = { ids: [1] };
    const fetch = vi.fn().mockResolvedValue(true);
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePolling({
          intervalMs: 1000,
          enabled,
          collectKeys: () => holder.ids,
          shouldFetch: () => true,
          fetch,
        }),
      { initialProps: { enabled: false } }
    );

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    expect(fetch).toHaveBeenCalledTimes(2);

    rerender({ enabled: false });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops polling on unmount", async () => {
    const holder = { ids: [1] };
    const { fetch, render } = renderPoller({ ids: () => holder.ids });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    render.unmount();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
