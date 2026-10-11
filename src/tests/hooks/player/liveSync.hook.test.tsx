import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "../../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { resetTransportInflight } from "@/api/transport.api";
import { useLivePlaylistSync } from "@/hooks/player/liveSync.hook";
import type { TorrentFileInfo } from "@/types/torrent";
import type { PlaylistWatch } from "@/types/videoPlayer";

const WATCH: PlaylistWatch = {
  kind: "torrent",
  torrentId: 7,
  saveDir: "C:/T",
  anchor: "C:/T/ep01.mkv",
};

function torrentFile(name: string, completed: boolean): TorrentFileInfo {
  return {
    index: 0,
    name,
    size: 10,
    progress_bytes: completed ? 10 : 1,
    completed,
    selected: false,
    priority: "normal",
    exists: true,
  };
}

const pollState = { ep2done: false };
const liveState = { entries: [{ index: 0, filename: "C:/T/ep01.mkv", title: "" }] };
const insertCalls: Array<unknown> = [];

beforeEach(() => {
  vi.useFakeTimers();
  pollState.ep2done = false;
  liveState.entries = [{ index: 0, filename: "C:/T/ep01.mkv", title: "" }];
  insertCalls.length = 0;
  mockInvoke.mockReset();
  resetTransportInflight();
  mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
    if (command === "get_running_torrent_files") {
      return [torrentFile("ep01.mkv", true), torrentFile("ep02.mkv", pollState.ep2done)];
    }
    if (command === "player_playlist_entries") return liveState.entries;
    if (command === "player_get_property" && args?.name === "path") return "C:/T/ep01.mkv";
    if (command === "player_get_property") return 0;
    if (command === "player_insert_files") {
      insertCalls.push((args as { items: unknown }).items);
      return undefined;
    }
    return null;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useLivePlaylistSync torrent watch", () => {
  it("inserts a completion that arrived before the first check", async () => {
    pollState.ep2done = true;
    renderHook(() => useLivePlaylistSync(WATCH));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(insertCalls).toEqual([[{ path: "C:/T/ep02.mkv", index: 1 }]]);
  });

  it("does nothing when the live list already matches", async () => {
    pollState.ep2done = true;
    liveState.entries = [
      { index: 0, filename: "C:/T/ep01.mkv", title: "" },
      { index: 1, filename: "C:/T/ep02.mkv", title: "" },
    ];
    renderHook(() => useLivePlaylistSync(WATCH));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(insertCalls).toEqual([]);
  });

  it("picks up a late completion on the next poll", async () => {
    renderHook(() => useLivePlaylistSync(WATCH));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(insertCalls).toEqual([]);

    pollState.ep2done = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(insertCalls).toEqual([[{ path: "C:/T/ep02.mkv", index: 1 }]]);
  });

  it("stays quiet after the anchor leaves the live list", async () => {
    liveState.entries = [];
    renderHook(() => useLivePlaylistSync(WATCH));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(insertCalls).toEqual([]);

    pollState.ep2done = true;
    liveState.entries = [{ index: 0, filename: "C:/T/ep02.mkv", title: "" }];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(insertCalls).toEqual([]);
  });
});
