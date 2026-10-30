import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useTorrentFilesMap } from "@/hooks/torrent/queries.hook";
import type { TorrentFileInfo } from "@/types/torrent/torrent";

import { mockInvoke } from "@/tests/mocks";

const TWO_IDS = [1, 2];
const ONE_ID = [1];

const torrentFile = (name: string): TorrentFileInfo => {
  return {
    index: 0,
    name,
    size: 10,
    progress_bytes: 10,
    completed: true,
    selected: false,
    priority: "normal",
    exists: true,
  };
};

const wrapper = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

afterEach(() => cleanup());

describe("useTorrentFilesMap batching", () => {
  it("loads every torrent through one batch and never per torrent", async () => {
    const calls: string[] = [];
    mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
      if (command === "get_running_torrent_files") {
        calls.push("single");
        return [];
      }
      if (command === "get_running_torrent_files_batch") {
        calls.push("batch");
        const ids = (args?.ids as number[]) ?? [];
        return ids.map((id) => ({ id, error: null, files: [torrentFile(`ep${id}.mkv`)] }));
      }
      return null;
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTorrentFilesMap(TWO_IDS, 10_000), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.files[1]?.length).toBe(1));
    await waitFor(() => expect(result.current.files[2]?.length).toBe(1));
    expect(calls).toEqual(["batch"]);
  });

  it("falls back to a per-torrent fetch when polling is off", async () => {
    const calls: string[] = [];
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "get_running_torrent_files") {
        calls.push("single");
        return [torrentFile("ep1.mkv")];
      }
      if (command === "get_running_torrent_files_batch") {
        calls.push("batch");
        return [];
      }
      return null;
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTorrentFilesMap(ONE_ID, false), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.files[1]?.length).toBe(1));
    expect(calls).toEqual(["single"]);
  });

  it("runs an immediate targeted batch on requestRefresh", async () => {
    const batches: unknown[] = [];
    let extra = false;
    mockInvoke.mockImplementation(async (command: unknown, args?: Record<string, unknown>) => {
      if (command === "get_running_torrent_files_batch") {
        batches.push(args?.ids);
        const files = [torrentFile("ep1.mkv")];
        if (extra) files.push(torrentFile("ep9.mkv"));
        return ((args?.ids ?? []) as number[]).map((id) => ({ id, error: null, files }));
      }
      return null;
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTorrentFilesMap(ONE_ID, 10_000), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.files[1]?.length).toBe(1));
    expect(batches).toEqual([[1]]);

    extra = true;
    result.current.requestRefresh([1]);
    await waitFor(() => expect(result.current.files[1]?.length).toBe(2));
    expect(batches).toEqual([[1], [1]]);
  });
});
