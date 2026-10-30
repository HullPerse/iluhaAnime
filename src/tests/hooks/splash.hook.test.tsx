import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSplashStages } from "@/hooks/splash.hook";
import type { DbCheckResult } from "@/types/splash";
import {
  markCacheReady,
  markIndexReady,
  markSpellingReady,
  resetSplashSignals,
} from "@/lib/signals.utils";

const OPTIONS = { minMs: 50, stageTimeoutMs: 100, stepMs: 30 };

const okCheck = (): Promise<DbCheckResult> =>
  Promise.resolve({ ok: true, message: "", status: null });

afterEach(() => {
  cleanup();
});

describe("useSplashStages", () => {
  beforeEach(() => {
    resetSplashSignals();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("paces every gating stage and finishes when all settle", async () => {
    const view = renderHook(
      ({ ready }) => useSplashStages(ready, { ...OPTIONS, checkDatabase: okCheck }),
      { initialProps: { ready: false } }
    );
    expect(view.result.current.done).toBe(false);
    act(() => {
      markCacheReady();
      markSpellingReady();
      markIndexReady();
    });
    view.rerender({ ready: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(view.result.current.done).toBe(true);
    expect(view.result.current.stages.every((stage) => stage.status === "done")).toBe(true);
  });

  it("holds the splash for the minimum display time", async () => {
    const view = renderHook(
      ({ ready }) => useSplashStages(ready, { ...OPTIONS, checkDatabase: okCheck }),
      { initialProps: { ready: false } }
    );
    act(() => {
      markCacheReady();
      markSpellingReady();
      markIndexReady();
    });
    view.rerender({ ready: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(view.result.current.done).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(view.result.current.done).toBe(true);
  });

  it("fails the database stage and recovers on retry", async () => {
    let healthy = false;
    const check = (): Promise<DbCheckResult> =>
      Promise.resolve(
        healthy
          ? { ok: true, message: "", status: null }
          : { ok: false, message: "open app database: locked", status: null }
      );
    const view = renderHook(
      ({ ready }) => useSplashStages(ready, { ...OPTIONS, checkDatabase: check }),
      { initialProps: { ready: true } }
    );
    act(() => {
      markCacheReady();
      markSpellingReady();
      markIndexReady();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(view.result.current.dbFailed).toBe(true);
    expect(view.result.current.dbError).toBe("open app database: locked");
    expect(view.result.current.done).toBe(false);

    healthy = true;
    act(() => {
      view.result.current.retryDatabase();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(view.result.current.dbFailed).toBe(false);
    expect(view.result.current.done).toBe(true);
  });

  it("degrades the cache stage on timeout and still finishes", async () => {
    const view = renderHook(
      ({ ready }) => useSplashStages(ready, { ...OPTIONS, checkDatabase: okCheck }),
      { initialProps: { ready: true } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(view.result.current.stages.find((stage) => stage.id === "cache")?.status).toBe(
      "degraded"
    );
    expect(view.result.current.done).toBe(true);
  });

  it("degrades the spelling warmup on timeout and still finishes", async () => {
    const view = renderHook(
      ({ ready }) => useSplashStages(ready, { ...OPTIONS, checkDatabase: okCheck }),
      { initialProps: { ready: true } }
    );
    act(() => {
      markCacheReady();
      markIndexReady();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(view.result.current.stages.find((stage) => stage.id === "spelling")?.status).toBe(
      "degraded"
    );
    expect(view.result.current.done).toBe(true);
  });
});
