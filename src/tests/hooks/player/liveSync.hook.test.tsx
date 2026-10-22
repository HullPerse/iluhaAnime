import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke, mockListen } from "../../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { resetTransportInflight } from "@/api/transport.api";
import { useLivePlaylistSync } from "@/hooks/player/liveSync.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { playbackAtoms } from "@/store/player.store";
import type { PlaylistWatch, PlayerSource } from "@/types/videoPlayer";

const WATCH: PlaylistWatch = {
  kind: "torrent",
  torrentId: 7,
  saveDir: "C:/T",
  anchor: "C:/T/ep01.mkv",
};

const FOLDER_WATCH: PlaylistWatch = {
  kind: "folder",
  root: "C:/F",
  anchor: "C:/F/ep01.mkv",
};

function folderEntry(path: string): { path: string; name: string; size: number } {
  return { path, name: path.split("/").pop() ?? path, size: 10 };
}

const SOURCES: PlayerSource[] = [
  { target: "C:/T/ep01.mkv", path: "C:/T/ep01.mkv", streaming: false },
  { target: "C:/T/ep02.mkv", path: "C:/T/ep02.mkv", streaming: false },
];

const liveState = { entries: [{ index: 0, filename: "C:/T/ep01.mkv", title: "" }] };
const insertCalls: Array<unknown> = [];

beforeEach(() => {
  vi.useFakeTimers();
  liveState.entries = [{ index: 0, filename: "C:/T/ep01.mkv", title: "" }];
  insertCalls.length = 0;
  mockInvoke.mockReset();
  resetTransportInflight();
  mockListen.mockImplementation(() => Promise.resolve(() => undefined));
  mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
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
  playbackAtoms.path.set("");
});

function renderSync(
  watch: PlaylistWatch,
  sources: PlayerSource[] = [],
  options?: { onPlayingFileModified?: () => void }
): { queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderHook(() => useLivePlaylistSync(watch, sources, options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { queryClient };
}

describe("useLivePlaylistSync torrent watch", () => {
  it("inserts a prepared source that is missing from the live list", async () => {
    renderSync(WATCH, SOURCES);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(insertCalls).toEqual([[{ path: "C:/T/ep02.mkv", index: 1 }]]);
  });

  it("does nothing when the live list already matches", async () => {
    liveState.entries = [
      { index: 0, filename: "C:/T/ep01.mkv", title: "" },
      { index: 1, filename: "C:/T/ep02.mkv", title: "" },
    ];
    renderSync(WATCH, SOURCES);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(insertCalls).toEqual([]);
  });

  it("maps the anchor path to its stream url", async () => {
    const url = "http://127.0.0.1:9/s/token/Show%20-%2001.mkv";
    const sources: PlayerSource[] = [
      {
        target: url,
        path: "C:/T/Show - 01.mkv",
        streaming: true,
        token: "token",
      },
    ];
    liveState.entries = [{ index: 0, filename: url, title: "" }];
    mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
      if (command === "player_playlist_entries") return liveState.entries;
      if (command === "player_get_property" && args?.name === "path") return url;
      if (command === "player_get_property") return 0;
      if (command === "player_insert_files") {
        insertCalls.push((args as { items: unknown }).items);
        return undefined;
      }
      return null;
    });

    renderSync({ ...WATCH, anchor: "C:/T/Show - 01.mkv" }, sources);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(insertCalls).toEqual([]);
  });

  it("adds a later extra file next to the sources", async () => {
    const { queryClient } = renderSync(WATCH, [SOURCES[0]]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    queryClient.setQueryData(queryKeys.extraFiles("C:/T"), [
      { name: "ep03.mkv", fullPath: "C:/T/ep03.mkv", size: 10 },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(insertCalls).toEqual([[{ path: "C:/T/ep03.mkv", index: 1 }]]);
  });

  it("stays quiet after the anchor leaves the live list", async () => {
    liveState.entries = [];
    renderSync(WATCH, SOURCES);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(insertCalls).toEqual([]);

    liveState.entries = [{ index: 0, filename: "C:/T/ep02.mkv", title: "" }];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(insertCalls).toEqual([]);
  });
});

describe("useLivePlaylistSync folder watch", () => {
  it("inserts a new file when the watcher reports its root", async () => {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    mockListen.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        handler = callback;
        return Promise.resolve(() => undefined);
      }
    );
    mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
      if (command === "refresh_file_index") {
        return [folderEntry("C:/F/ep01.mkv"), folderEntry("C:/F/ep02.mkv")];
      }
      if (command === "player_playlist_entries") {
        return [{ index: 0, filename: "C:/F/ep01.mkv", title: "" }];
      }
      if (command === "player_get_property" && args?.name === "path") return "C:/F/ep01.mkv";
      if (command === "player_get_property") return 0;
      if (command === "player_insert_files") {
        insertCalls.push((args as { items: unknown }).items);
        return undefined;
      }
      return null;
    });

    renderSync(FOLDER_WATCH);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      handler?.({
        payload: {
          roots: ["C:/F"],
          changes: [{ path: "C:/F/ep02.mkv", root: "C:/F", kind: "created" }],
        },
      });
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(insertCalls).toEqual([[{ path: "C:/F/ep02.mkv", index: 1 }]]);
  });
});

describe("useLivePlaylistSync folder modifications", () => {
  function armFolder(): () => ((event: { payload: unknown }) => void) | undefined {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    mockListen.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        handler = callback;
        return Promise.resolve(() => undefined);
      }
    );
    mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
      if (command === "refresh_file_index") {
        return [folderEntry("C:/F/ep01.mkv"), folderEntry("C:/F/ep02.mkv")];
      }
      if (command === "player_playlist_entries") {
        return [{ index: 0, filename: "C:/F/ep01.mkv", title: "" }];
      }
      if (command === "player_get_property" && args?.name === "path") return "C:/F/ep01.mkv";
      if (command === "player_get_property") return 0;
      if (command === "player_insert_files") return undefined;
      return null;
    });
    return () => handler;
  }

  it("reloads when the playing file itself was modified", async () => {
    const handler = armFolder();
    playbackAtoms.path.set("C:/F/ep01.mkv");
    const reloads = vi.fn();
    renderSync(FOLDER_WATCH, [], { onPlayingFileModified: reloads });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      handler()?.({
        payload: {
          roots: ["C:/F"],
          changes: [{ path: "C:/F/ep01.mkv", root: "C:/F", kind: "modified" }],
        },
      });
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(reloads).toHaveBeenCalledTimes(1);
  });

  it("does not reload when another file was modified", async () => {
    const handler = armFolder();
    playbackAtoms.path.set("C:/F/ep01.mkv");
    const reloads = vi.fn();
    renderSync(FOLDER_WATCH, [], { onPlayingFileModified: reloads });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      handler()?.({
        payload: {
          roots: ["C:/F"],
          changes: [{ path: "C:/F/ep02.mkv", root: "C:/F", kind: "modified" }],
        },
      });
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(reloads).not.toHaveBeenCalled();
  });

  it("skips the scan for changes outside the video extensions", async () => {
    const handler = armFolder();
    const scans: unknown[] = [];
    const base = mockInvoke.getMockImplementation();
    mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
      if (command === "refresh_file_index") scans.push(args);
      return base?.(command, args);
    });

    renderSync(FOLDER_WATCH);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      handler()?.({
        payload: {
          roots: ["C:/F"],
          changes: [{ path: "C:/F/cover.jpg", root: "C:/F", kind: "created" }],
        },
      });
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(scans).toEqual([]);
  });
});

describe("useLivePlaylistSync torrent watcher events", () => {
  function armTorrent(): () => ((event: { payload: unknown }) => void) | undefined {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    mockListen.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        handler = callback;
        return Promise.resolve(() => undefined);
      }
    );
    return () => handler;
  }

  function fire(
    handler: ((event: { payload: unknown }) => void) | undefined,
    changes: Array<{ path: string; root: string; kind: string }>
  ): void {
    handler?.({ payload: { roots: ["C:/T"], changes } });
  }

  it("does not rescan the torrent on a save-dir event", async () => {
    const handler = armTorrent();
    liveState.entries = [
      { index: 0, filename: "C:/T/ep01.mkv", title: "" },
      { index: 1, filename: "C:/T/ep02.mkv", title: "" },
    ];
    renderSync(WATCH, SOURCES);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(insertCalls).toEqual([]);

    await act(async () => {
      fire(handler(), [{ path: "C:/T/ep02.mkv", root: "C:/T", kind: "created" }]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "get_running_torrent_files")
    ).toEqual([]);
    expect(insertCalls).toEqual([]);
  });

  it("ignores events outside the torrent save dir", async () => {
    const handler = armTorrent();
    const checks = mockInvoke.mock.calls.length;
    renderSync(WATCH);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const afterMount = mockInvoke.mock.calls.length;
    await act(async () => {
      fire(handler(), [{ path: "C:/Other/ep09.mkv", root: "C:/Other", kind: "created" }]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockInvoke.mock.calls.length).toBe(afterMount);
    expect(checks).toBeLessThanOrEqual(afterMount);
  });

  it("reloads the playing file when modified after the torrent finished", async () => {
    const handler = armTorrent();
    playbackAtoms.path.set("C:/T/ep01.mkv");
    const reloads = vi.fn();
    renderSync(WATCH, SOURCES, { onPlayingFileModified: reloads });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      fire(handler(), [{ path: "C:/T/ep01.mkv", root: "C:/T", kind: "modified" }]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(reloads).toHaveBeenCalledTimes(1);
  });

  it("does not reload a file that is being streamed", async () => {
    const handler = armTorrent();
    const url = "http://127.0.0.1:9/s/token/Show%20-%2001.mkv";
    playbackAtoms.path.set(url);
    const reloads = vi.fn();
    renderSync(
      WATCH,
      [{ target: url, path: "C:/T/ep01.mkv", streaming: true, token: "token" }],
      { onPlayingFileModified: reloads }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      fire(handler(), [{ path: "C:/T/ep01.mkv", root: "C:/T", kind: "modified" }]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(reloads).not.toHaveBeenCalled();
  });

  it("pulls save-dir extras into the torrent playlist on a save-dir event", async () => {
    const handler = armTorrent();
    const { queryClient } = renderSync(WATCH, [SOURCES[0]]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(insertCalls).toEqual([]);

    queryClient.setQueryData(queryKeys.extraFiles("C:/T"), [
      { name: "ep01_upscaled.mp4", size: 5, fullPath: "C:/T/ep01_upscaled.mp4" },
    ]);
    await act(async () => {
      fire(handler(), [{ path: "C:/T/ep01_upscaled.mp4", root: "C:/T", kind: "created" }]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(insertCalls).toEqual([[{ path: "C:/T/ep01_upscaled.mp4", index: 0 }]]);
  });
});
