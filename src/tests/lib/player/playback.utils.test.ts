import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { readDuration, readPlaylistIndex } from "@/lib/player/playback.utils";

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("readDuration", () => {
  it("returns the mpv duration property", async () => {
    mockInvoke.mockResolvedValue(1400.5);
    await expect(readDuration()).resolves.toBe(1400.5);
    expect(mockInvoke).toHaveBeenCalledWith("player_get_property", {
      name: "duration",
      format: "double",
    });
  });

  it.each([null, undefined, Number.NaN, "1400", Infinity])(
    "falls back to zero for %p",
    async (value) => {
      mockInvoke.mockResolvedValue(value);
      await expect(readDuration()).resolves.toBe(0);
    }
  );

  it("falls back to zero when the command fails", async () => {
    mockInvoke.mockRejectedValue(new Error("no player"));
    await expect(readDuration()).resolves.toBe(0);
  });
});

describe("readPlaylistIndex", () => {
  it("returns the mpv playlist-index property", async () => {
    mockInvoke.mockResolvedValue(0);
    await expect(readPlaylistIndex()).resolves.toBe(0);
    expect(mockInvoke).toHaveBeenCalledWith("player_get_property", {
      name: "playlist-index",
      format: "int64",
    });
  });

  it.each([null, undefined, Number.NaN, "0"])("falls back to -1 for %p", async (value) => {
    mockInvoke.mockResolvedValue(value);
    await expect(readPlaylistIndex()).resolves.toBe(-1);
  });

  it("falls back to -1 when the command fails", async () => {
    mockInvoke.mockRejectedValue(new Error("no player"));
    await expect(readPlaylistIndex()).resolves.toBe(-1);
  });
});
