import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  awaitCacheReady,
  isCacheReady,
  isIndexReady,
  isSpellingReady,
  markCacheReady,
  markIndexReady,
  markSpellingReady,
  resetSplashSignals,
} from "@/lib/splash/signals.utils";

describe("splash signals contract", () => {
  beforeEach(() => {
    resetSplashSignals();
    vi.useRealTimers();
  });

  it("starts unready and resolves waiters on mark", async () => {
    expect(isCacheReady()).toBe(false);
    const pending = awaitCacheReady(1000);
    markCacheReady();
    await expect(pending).resolves.toBe(true);
    expect(isCacheReady()).toBe(true);
    await expect(awaitCacheReady(1000)).resolves.toBe(true);
  });

  it("times out when the cache never settles", async () => {
    vi.useFakeTimers();
    try {
      const pending = awaitCacheReady(100);
      const assertion = expect(pending).resolves.toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await assertion;
      expect(isCacheReady()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks once and resets cleanly", () => {
    markCacheReady();
    markCacheReady();
    expect(isCacheReady()).toBe(true);
    resetSplashSignals();
    expect(isCacheReady()).toBe(false);
  });

  it("tracks spelling and index warmups independently", () => {
    expect(isSpellingReady()).toBe(false);
    expect(isIndexReady()).toBe(false);
    markSpellingReady();
    expect(isSpellingReady()).toBe(true);
    expect(isIndexReady()).toBe(false);
    markIndexReady();
    expect(isIndexReady()).toBe(true);
    resetSplashSignals();
    expect(isSpellingReady()).toBe(false);
    expect(isIndexReady()).toBe(false);
  });
});
