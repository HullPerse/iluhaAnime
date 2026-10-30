import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "@/tests/mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { buildTorrentPlayerPlaylist, readDuration, readPlaylistIndex } from "@/lib/playback.utils";

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
  it("returns the mpv playlist-pos property", async () => {
    mockInvoke.mockResolvedValue(0);
    await expect(readPlaylistIndex()).resolves.toBe(0);
    expect(mockInvoke).toHaveBeenCalledWith("player_get_property", {
      name: "playlist-pos",
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

describe("buildTorrentPlayerPlaylist", () => {
  const tracks = new Set(["mp3", "srt", "ass"]);
  const file = (
    name: string,
    overrides: Partial<{ completed: boolean; exists: boolean; fullPath?: string }> = {}
  ) => ({ name, completed: true, exists: true, ...overrides });

  it("sorts completed files numerically and points at the clicked file", () => {
    const files = [file("Anime/ep10.mkv"), file("Anime/ep02.mkv"), file("Anime/ep01.mkv")];
    const playlist = buildTorrentPlayerPlaylist(
      files,
      "C:/Torrents/Anime",
      "C:/Torrents/Anime/Anime/ep02.mkv",
      tracks
    );
    expect(playlist?.files).toEqual([
      "C:/Torrents/Anime/Anime/ep01.mkv",
      "C:/Torrents/Anime/Anime/ep02.mkv",
      "C:/Torrents/Anime/Anime/ep10.mkv",
    ]);
    expect(playlist?.startIndex).toBe(1);
  });

  it("drops incomplete and missing files from the playlist", () => {
    const files = [
      file("ep01.mkv"),
      file("ep02.mkv", { completed: false }),
      file("ep03.mkv", { exists: false }),
    ];
    const playlist = buildTorrentPlayerPlaylist(files, "C:/T", "C:/T/ep01.mkv", tracks);
    expect(playlist?.files).toEqual(["C:/T/ep01.mkv"]);
    expect(playlist?.startIndex).toBe(0);
  });

  it("drops audio and subtitle files", () => {
    const files = [file("ep01.mkv"), file("song.mp3"), file("subs.ass")];
    const playlist = buildTorrentPlayerPlaylist(files, "C:/T", "C:/T/ep01.mkv", tracks);
    expect(playlist?.files).toEqual(["C:/T/ep01.mkv"]);
  });

  it("appends extra full paths and dedupes repeats", () => {
    const files = [file("ep01.mkv")];
    const playlist = buildTorrentPlayerPlaylist(files, "C:/T", "C:/T/ep01.mkv", tracks, [
      "C:/T/ep01.mkv",
      "C:/T/ep01.upscaled.mkv",
    ]);
    expect(playlist?.files).toEqual(["C:/T/ep01.mkv", "C:/T/ep01.upscaled.mkv"]);
    expect(playlist?.startIndex).toBe(0);
  });

  it("keeps the native save-dir separators like the existing open path", () => {
    const playlist = buildTorrentPlayerPlaylist([file("ep01.mkv")], "C:\\T", "C:\\T/ep01.mkv");
    expect(playlist?.files).toEqual(["C:\\T/ep01.mkv"]);
    expect(playlist?.startIndex).toBe(0);
  });

  it("returns null when the clicked file is absent or nothing is playable", () => {
    expect(
      buildTorrentPlayerPlaylist([file("ep01.mkv")], "C:/T", "C:/T/missing.mkv", tracks)
    ).toBeNull();
    expect(
      buildTorrentPlayerPlaylist(
        [file("ep02.mkv", { completed: false })],
        "C:/T",
        "C:/T/ep02.mkv",
        tracks
      )
    ).toBeNull();
    expect(buildTorrentPlayerPlaylist([], "C:/T", "C:/T/ep01.mkv", tracks)).toBeNull();
  });
});
