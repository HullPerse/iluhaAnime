import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

vi.mock("@/lib/utils/image.utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/utils/image.utils")>();
  return { ...original, assetUrl: (path: string) => `asset://${path}` };
});

import {
  fetchVideoCard,
  getCachedCard,
  neighborCardPaths,
  orderCardPaths,
  resetCardCache,
  scheduleCardPrefetch,
  scheduleNeighborPrefetch,
} from "@/lib/player/cardCache.utils";

beforeEach(() => {
  resetCardCache();
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_video_card")
      return Promise.resolve({ path: "thumb.jpg", duration: 10, size: 100 });
    return Promise.resolve(undefined);
  });
});

describe("orderCardPaths", () => {
  it("puts the active path first then neighbors by distance", () => {
    const paths = ["a.mkv", "b.mkv", "c.mkv", "d.mkv", "e.mkv"];
    expect(orderCardPaths(paths, "c.mkv")).toEqual(["c.mkv", "d.mkv", "b.mkv", "e.mkv", "a.mkv"]);
  });

  it("drops empty paths and duplicates", () => {
    expect(orderCardPaths(["a.mkv", "", "a.mkv", "b.mkv"], "a.mkv")).toEqual(["a.mkv", "b.mkv"]);
  });

  it("starts from the first path when active is missing", () => {
    expect(orderCardPaths(["a.mkv", "b.mkv"], "z.mkv")).toEqual(["a.mkv", "b.mkv"]);
  });

  it("returns empty for empty input", () => {
    expect(orderCardPaths([], "a.mkv")).toEqual([]);
  });
});

describe("fetchVideoCard", () => {
  it("caches the card after the first fetch", async () => {
    await fetchVideoCard("a.mkv");
    await fetchVideoCard("a.mkv");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(getCachedCard("a.mkv")?.url).toBe("asset://thumb.jpg");
  });

  it("dedups concurrent fetches of the same path", async () => {
    const [first, second] = await Promise.all([fetchVideoCard("a.mkv"), fetchVideoCard("a.mkv")]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("returns null when the native command fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("nope"));
    await expect(fetchVideoCard("bad.mkv")).resolves.toBeNull();
    expect(getCachedCard("bad.mkv")).toBeNull();
  });
});

describe("scheduleCardPrefetch", () => {
  it("warms the active card and neighbors without awaiting", async () => {
    scheduleCardPrefetch(["a.mkv", "b.mkv", "c.mkv"], "b.mkv");
    await vi.waitFor(() => {
      expect(getCachedCard("b.mkv")).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(getCachedCard("a.mkv")).not.toBeNull();
      expect(getCachedCard("c.mkv")).not.toBeNull();
    });
  });
});

describe("neighborCardPaths", () => {
  it("returns the immediate prev and next files", () => {
    expect(neighborCardPaths(["a.mkv", "b.mkv", "c.mkv", "d.mkv"], "b.mkv")).toEqual([
      "a.mkv",
      "c.mkv",
    ]);
  });

  it("returns only the existing side at the playlist edges", () => {
    expect(neighborCardPaths(["a.mkv", "b.mkv"], "a.mkv")).toEqual(["b.mkv"]);
    expect(neighborCardPaths(["a.mkv", "b.mkv"], "b.mkv")).toEqual(["a.mkv"]);
  });

  it("matches the active file case-insensitively", () => {
    expect(neighborCardPaths(["A.mkv", "b.mkv", "c.mkv"], "a.mkv")).toEqual(["b.mkv"]);
  });

  it("drops empty paths and duplicates", () => {
    expect(neighborCardPaths(["a.mkv", "", "a.mkv", "b.mkv"], "a.mkv")).toEqual(["b.mkv"]);
  });

  it("returns empty for empty input", () => {
    expect(neighborCardPaths([], "a.mkv")).toEqual([]);
  });

  it("trusts the backend index when the path repeats in the queue", () => {
    expect(
      neighborCardPaths(["D:/a.mkv", "D:/b.mkv", "D:/c.mkv", "D:/b.mkv"], "D:/b.mkv", 3)
    ).toEqual(["D:/c.mkv"]);
  });

  it("falls back to path search on a stale index", () => {
    expect(
      neighborCardPaths(["D:/a.mkv", "D:/b.mkv", "D:/c.mkv", "D:/b.mkv"], "D:/b.mkv", 0)
    ).toEqual(["D:/a.mkv", "D:/c.mkv"]);
  });
});

describe("scheduleNeighborPrefetch", () => {
  it("warms only the two neighbors, not the active file or far entries", async () => {
    scheduleNeighborPrefetch(["a.mkv", "b.mkv", "c.mkv", "d.mkv", "e.mkv"], "c.mkv");
    await vi.waitFor(() => {
      expect(getCachedCard("b.mkv")).not.toBeNull();
      expect(getCachedCard("d.mkv")).not.toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getCachedCard("a.mkv")).toBeNull();
    expect(getCachedCard("c.mkv")).toBeNull();
    expect(getCachedCard("e.mkv")).toBeNull();
    const fetched = invokeMock.mock.calls
      .filter(([command]) => command === "get_video_card")
      .map(([, args]) => (args as { path?: string }).path)
      .sort();
    expect(fetched).toEqual(["b.mkv", "d.mkv"]);
  });

  it("skips already cached neighbors without extra fetches", async () => {
    await fetchVideoCard("a.mkv");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    scheduleNeighborPrefetch(["a.mkv", "b.mkv", "c.mkv"], "b.mkv");
    await vi.waitFor(() => {
      expect(getCachedCard("c.mkv")).not.toBeNull();
    });
    const aFetches = invokeMock.mock.calls.filter(
      ([command, args]) =>
        command === "get_video_card" && (args as { path?: string }).path === "a.mkv"
    );
    expect(aFetches).toHaveLength(1);
  });
});
