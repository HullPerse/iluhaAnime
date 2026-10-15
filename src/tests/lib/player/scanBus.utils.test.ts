import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "../../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { createScanBus, type ScanExecutors } from "@/lib/player/scanBus.utils";
import type { VideoFileEntry } from "@/types/fs";

const WAIT_MS = 50;
const EXTENSIONS = ["mkv"];

function entry(path: string): VideoFileEntry {
  const name = path.replaceAll("\\", "/").split("/").pop() as string;
  return { path, name, size: 1 };
}

function sorted(entries: VideoFileEntry[]): string[] {
  return entries.map((file) => file.path).sort();
}

const walkEveryRoot: ScanExecutors["walk"] = vi.fn(
  async (roots: string[], _extensions: string[], _threads: number) =>
    roots.flatMap((root) => [entry(`${root}/ep1.mkv`), entry(`${root}/Season 2/ep2.mkv`)])
);

const patchUpserts: ScanExecutors["patch"] = vi.fn(
  async (upserts: string[], _removals: string[], _extensions: string[], _threads: number) =>
    upserts.map((path) => entry(path))
);

function request(root: string) {
  return { root, extensions: EXTENSIONS, threads: 0 };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("scanBus", () => {
  it("shares one walk between consumers asking for the same root in a tick", async () => {
    const bus = createScanBus({ walk: walkEveryRoot, patch: patchUpserts, waitMs: WAIT_MS });

    const route = bus.fullScan(request("C:/A"));
    const playlist = bus.fullScan(request("C:/A"));
    expect(walkEveryRoot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WAIT_MS);
    expect(walkEveryRoot).toHaveBeenCalledTimes(1);
    expect(await route).toEqual(await playlist);
    expect(sorted(await route)).toEqual(["C:/A/ep1.mkv", "C:/A/Season 2/ep2.mkv"].sort());
  });

  it("batches different roots into one call and splits the entries back", async () => {
    const bus = createScanBus({ walk: walkEveryRoot, patch: patchUpserts, waitMs: WAIT_MS });

    const first = bus.fullScan(request("C:/A"));
    const second = bus.fullScan(request("C:/B"));
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(walkEveryRoot).toHaveBeenCalledTimes(1);
    expect(walkEveryRoot).toHaveBeenCalledWith(["C:/A", "C:/B"], EXTENSIONS, 0);
    expect(sorted(await first)).toEqual(["C:/A/ep1.mkv", "C:/A/Season 2/ep2.mkv"].sort());
    expect(sorted(await second)).toEqual(["C:/B/ep1.mkv", "C:/B/Season 2/ep2.mkv"].sort());
  });

  it("upgrades a point update to a walk when one tick asks for both", async () => {
    const bus = createScanBus({ walk: walkEveryRoot, patch: patchUpserts, waitMs: WAIT_MS });

    const patched = bus.patchScan({
      ...request("C:/A"),
      upserts: ["C:/A/ep1.mkv"],
      removals: ["C:/A/old.mkv"],
    });
    const walked = bus.fullScan(request("C:/A"));
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(patchUpserts).not.toHaveBeenCalled();
    expect(walkEveryRoot).toHaveBeenCalledTimes(1);
    const outcome = await patched;
    expect(outcome.kind).toBe("full");
    if (outcome.kind === "full") {
      expect(sorted(outcome.entries)).toEqual(["C:/A/ep1.mkv", "C:/A/Season 2/ep2.mkv"].sort());
    }
    expect(sorted(await walked)).toEqual(["C:/A/ep1.mkv", "C:/A/Season 2/ep2.mkv"].sort());
  });

  it("collects point updates of a tick into one call and groups them by root", async () => {
    const walk = vi.fn(async () => []);
    const bus = createScanBus({ walk, patch: patchUpserts, waitMs: WAIT_MS });

    const first = bus.patchScan({
      ...request("C:/A"),
      upserts: ["C:/A/ep1.mkv"],
      removals: ["C:/A/old.mkv"],
    });
    const second = bus.patchScan({
      ...request("C:/B"),
      upserts: ["C:/B/ep2.mkv"],
      removals: ["C:/B/old.mkv"],
    });
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(walk).not.toHaveBeenCalled();
    expect(patchUpserts).toHaveBeenCalledTimes(1);
    expect(patchUpserts).toHaveBeenCalledWith(
      ["C:/A/ep1.mkv", "C:/B/ep2.mkv"],
      ["C:/A/old.mkv", "C:/B/old.mkv"],
      EXTENSIONS,
      0
    );
    expect(await first).toEqual({
      kind: "patch",
      fresh: [entry("C:/A/ep1.mkv")],
      removed: ["C:/A/old.mkv"],
    });
    expect(await second).toEqual({
      kind: "patch",
      fresh: [entry("C:/B/ep2.mkv")],
      removed: ["C:/B/old.mkv"],
    });
  });

  it("rejects only the waiters of the call that failed", async () => {
    const walk = vi.fn(async () => {
      throw new Error("walk failed");
    });
    const bus = createScanBus({ walk, patch: patchUpserts, waitMs: WAIT_MS });

    const walked = bus.fullScan(request("C:/B"));
    const patched = bus.patchScan({
      ...request("C:/A"),
      upserts: ["C:/A/ep1.mkv"],
      removals: [],
    });
    const settled = Promise.allSettled([walked, patched]);
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    const [full, point] = await settled;
    expect(full?.status).toBe("rejected");
    if (full?.status === "rejected") expect(full.reason).toEqual(new Error("walk failed"));
    expect(point?.status).toBe("fulfilled");
  });

  it("starts a new tick for requests arriving after the batch ran", async () => {
    const bus = createScanBus({ walk: walkEveryRoot, patch: patchUpserts, waitMs: WAIT_MS });

    const first = bus.fullScan(request("C:/A"));
    await vi.advanceTimersByTimeAsync(WAIT_MS);
    await first;
    expect(walkEveryRoot).toHaveBeenCalledTimes(1);

    const second = bus.fullScan(request("C:/A"));
    await vi.advanceTimersByTimeAsync(WAIT_MS);
    expect(walkEveryRoot).toHaveBeenCalledTimes(2);
    expect(sorted(await second)).toEqual(["C:/A/ep1.mkv", "C:/A/Season 2/ep2.mkv"].sort());
  });

  it("flush runs the pending tick without waiting for the window", async () => {
    const walk = vi.fn(async () => []);
    const bus = createScanBus({ walk, patch: patchUpserts, waitMs: WAIT_MS });

    const pending = bus.fullScan(request("C:/A"));
    bus.flush();
    expect(walk).toHaveBeenCalledTimes(1);
    await pending;
  });

  it("rejects the pending tick on cancel", async () => {
    const walk = vi.fn(async () => []);
    const bus = createScanBus({ walk, patch: patchUpserts, waitMs: WAIT_MS });

    const pending = bus.fullScan(request("C:/A"));
    const settled = Promise.allSettled([pending]);
    bus.cancel();
    const [result] = await settled;
    expect(result?.status).toBe("rejected");
    expect(walk).not.toHaveBeenCalled();
  });
});

describe("scanBus default executors", () => {
  it("walks roots through refresh_file_index with paths, extensions, and threads", async () => {
    mockInvoke.mockResolvedValue([entry("C:/A/ep1.mkv"), entry("C:/B/ep9.mkv")]);
    const bus = createScanBus({ waitMs: WAIT_MS });

    const first = bus.fullScan(request("C:/A"));
    const second = bus.fullScan(request("C:/B"));
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("refresh_file_index", {
      paths: ["C:/A", "C:/B"],
      extensions: EXTENSIONS,
      threads: 0,
    });
    expect(sorted(await first)).toEqual(["C:/A/ep1.mkv"]);
    expect(sorted(await second)).toEqual(["C:/B/ep9.mkv"]);
  });

  it("patches paths through update_file_index_paths with upserts and removals", async () => {
    mockInvoke.mockResolvedValue([entry("C:/A/ep1.mkv")]);
    const bus = createScanBus({ waitMs: WAIT_MS });

    const patched = bus.patchScan({
      ...request("C:/A"),
      upserts: ["C:/A/ep1.mkv"],
      removals: ["C:/A/old.mkv"],
    });
    await vi.advanceTimersByTimeAsync(WAIT_MS);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("update_file_index_paths", {
      upserts: ["C:/A/ep1.mkv"],
      removals: ["C:/A/old.mkv"],
      extensions: EXTENSIONS,
      threads: 0,
    });
    expect(await patched).toEqual({
      kind: "patch",
      fresh: [entry("C:/A/ep1.mkv")],
      removed: ["C:/A/old.mkv"],
    });
  });
});
