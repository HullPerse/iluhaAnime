import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { measurePlayerStartup } from "@/lib/player/startup.utils";

const { performance: nativePerformance } = await vi.importActual<{ performance: Performance }>(
  "node:perf_hooks"
);

beforeEach(() => {
  vi.stubGlobal("performance", nativePerformance);
});

afterEach(() => {
  for (const entry of nativePerformance.getEntriesByType("measure")) {
    if (entry.name.startsWith("player:")) nativePerformance.clearMeasures(entry.name);
  }

  vi.unstubAllGlobals();
});

describe("player startup measurements", () => {
  it("preserves results and errors while recording completion status", async () => {
    expect(await measurePlayerStartup("native-init", async () => "ready")).toBe("ready");
    const error = new Error("init failed");
    await expect(
      measurePlayerStartup("settings", async () => {
        throw error;
      })
    ).rejects.toBe(error);
    const complete = nativePerformance.getEntriesByName(
      "player:native-init"
    )[0] as PerformanceMeasure;
    const failed = nativePerformance.getEntriesByName("player:settings")[0] as PerformanceMeasure;
    expect(complete.detail).toEqual({ status: "complete" });
    expect(failed.detail).toEqual({ status: "failed" });
    expect(complete.duration).toBeGreaterThanOrEqual(0);
  });

  it("replaces repeated measurements and ignores an obsolete asynchronous result", async () => {
    let resolveOld: (() => void) | undefined;
    let current = true;
    const old = measurePlayerStartup(
      "sidecars",
      () =>
        new Promise<void>((resolve) => {
          resolveOld = resolve;
        }),
      () => current
    );
    current = false;
    await measurePlayerStartup("sidecars", async () => undefined);
    const latest = nativePerformance.getEntriesByName("player:sidecars")[0];
    resolveOld?.();
    await old;
    expect(nativePerformance.getEntriesByName("player:sidecars")).toEqual([latest]);
    await measurePlayerStartup("sidecars", async () => undefined);
    expect(nativePerformance.getEntriesByName("player:sidecars")).toHaveLength(1);
    expect(nativePerformance.getEntriesByName("player:sidecars")[0]).not.toBe(latest);
  });
});
