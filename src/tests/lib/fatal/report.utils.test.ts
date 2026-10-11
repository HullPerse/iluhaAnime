import { beforeEach, describe, expect, it } from "vitest";

import {
  FATAL_SAFE_KEY,
  FATAL_STORAGE_KEY,
  clearFatal,
  consumeSafeMode,
  getCurrentFatal,
  isSafeMode,
  readLastFatal,
  reportFatal,
  requestSafeMode,
  resetFatalModule,
  subscribeFatal,
} from "@/lib/fatal/report.utils";
import type { FatalInfo } from "@/types/fatal";

const info = (overrides: Partial<FatalInfo> = {}): FatalInfo => ({
  kind: "render",
  message: "boom",
  scope: "render",
  themeName: "win95",
  route: "/",
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

describe("fatal report contract", () => {
  beforeEach(() => {
    resetFatalModule();
    localStorage.clear();
  });

  it("persists and reads back the last fatal", () => {
    reportFatal(info({ message: "render boom" }));
    expect(getCurrentFatal()?.message).toBe("render boom");
    expect(readLastFatal()?.message).toBe("render boom");
    expect(localStorage.getItem(FATAL_STORAGE_KEY)).toContain("render boom");
  });

  it("clears current and persisted fatal and notifies subscribers", () => {
    const seen: (FatalInfo | null)[] = [];
    const stop = subscribeFatal((next) => seen.push(next));
    reportFatal(info());
    clearFatal();
    stop();
    expect(getCurrentFatal()).toBeNull();
    expect(readLastFatal()).toBeNull();
    expect(seen).toEqual([info(), null]);
  });

  it("ignores malformed persisted payloads", () => {
    localStorage.setItem(FATAL_STORAGE_KEY, "{broken");
    expect(readLastFatal()).toBeNull();
    localStorage.setItem(FATAL_STORAGE_KEY, JSON.stringify({ kind: "nope" }));
    expect(readLastFatal()).toBeNull();
  });

  it("tracks the safe-mode flag across request and consume", () => {
    expect(isSafeMode()).toBe(false);
    requestSafeMode();
    expect(localStorage.getItem(FATAL_SAFE_KEY)).toBe("1");
    expect(isSafeMode()).toBe(true);
    expect(consumeSafeMode()).toBe(true);
    expect(isSafeMode()).toBe(false);
  });
});
