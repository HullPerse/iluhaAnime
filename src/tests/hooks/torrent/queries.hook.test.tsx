import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TORRENTS_QUERY_KEY,
  torrentFilesKey,
  usePauseTorrent,
  useRedownloadFile,
  useRemoveTorrent,
  useTorrentFiles,
  useTorrentFilesMap,
  useTorrents,
} from "@/hooks/torrent/queries.hook";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import type { TorrentInfo } from "@/types/torrent";

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

function torrent(id: number, overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    id,
    state: "live",
    progress_bytes: 0,
    download_speed: 0,
    ...overrides,
  } as TorrentInfo;
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => {});
  useTorrentStore.setState({ lastActiveAt: {}, opInFlight: {} });
  useNotificationStore.setState({ items: [] });
});

describe("useTorrents", () => {
  it("loads the list on mount", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1)]);
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    const { result, unmount } = renderHook(() => useTorrents(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(TORRENTS_QUERY_KEY)).toEqual([torrent(1)]);
    expect(listenMock).toHaveBeenCalledWith("torrents-update", expect.any(Function));
    unmount();
  });

  it("applies pushed updates to the cache", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1)]);
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    const { result, unmount } = renderHook(() => useTorrents(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const handler = listenMock.mock.calls[0]?.[1] as (event: { payload: TorrentInfo[] }) => void;
    handler({ payload: [torrent(1), torrent(2)] });
    expect(client.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY)?.map((t) => t.id)).toEqual([
      1, 2,
    ]);
    unmount();
  });

  it("notifies once when the initial load fails", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    const { Wrapper } = wrapper();
    const first = renderHook(() => useTorrents(), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    const second = renderHook(() => useTorrents(), { wrapper: Wrapper });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    const errors = useNotificationStore.getState().items.filter((item) => item.type === "error");
    expect(errors.length).toBe(1);
    first.unmount();
    second.unmount();
  });
});

describe("useTorrentFiles", () => {
  it("fetches files for the id", async () => {
    const files = [{ index: 0 }];
    invokeMock.mockResolvedValue(files);
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useTorrentFiles(7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(files);
    expect(invokeMock).toHaveBeenCalledWith("get_running_torrent_files", { id: 7 });
    unmount();
  });

  it("fetches files for id 0, the first librqbit session id", async () => {
    const files = [{ index: 0 }];
    invokeMock.mockResolvedValue(files);
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useTorrentFiles(0), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("get_running_torrent_files", { id: 0 });
    unmount();
  });

  it("keeps the previous list when a refresh fails", async () => {
    const files = [{ index: 0 }];
    invokeMock.mockResolvedValueOnce(files);

    const { Wrapper, client } = wrapper();
    const { result, unmount } = renderHook(() => useTorrentFiles(7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    invokeMock.mockRejectedValueOnce(new Error("offline"));
    await client.invalidateQueries({ queryKey: torrentFilesKey(7) });
    await waitFor(() => expect(client.getQueryData(torrentFilesKey(7))).toEqual(files));
    unmount();
  });
  it("keeps the array reference when polled files are unchanged", async () => {
    const file = {
      completed: false,
      exists: false,
      index: 0,
      priority: "normal",
      progress_bytes: 0,
      selected: true,
    };
    invokeMock.mockResolvedValueOnce([file]);
    const { Wrapper, client } = wrapper();
    const { result, unmount } = renderHook(() => useTorrentFiles(7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const first = result.current.data;
    invokeMock.mockResolvedValueOnce([{ ...file }]);
    await client.invalidateQueries({ queryKey: torrentFilesKey(7) });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBe(first);
    unmount();
  });
});

describe("usePauseTorrent", () => {
  it("applies the optimistic state and clears the op flag", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1)]);
      if (cmd === "pause_torrent") return Promise.resolve("ok");
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(1)]);
    const { result, unmount } = renderHook(() => usePauseTorrent(), { wrapper: Wrapper });
    result.current.mutate({ id: 1 });
    await waitFor(() =>
      expect(client.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY)?.[0]?.state).toBe("paused")
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useTorrentStore.getState().opInFlight[1]).toBeUndefined();
    unmount();
  });

  it("rolls back on failure and notifies", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1)]);
      if (cmd === "pause_torrent") return Promise.reject(new Error("denied"));
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(1)]);
    const { result, unmount } = renderHook(() => usePauseTorrent(), { wrapper: Wrapper });
    result.current.mutate({ id: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY)?.[0]?.state).toBe("live");
    expect(
      useNotificationStore.getState().items.some((item) => item.title === "Error pausing torrent:")
    ).toBe(true);
    unmount();
  });
});

describe("usePauseTorrent double invoke", () => {
  it("sends a single invoke for double clicks", async () => {
    let resolvePause!: (value: unknown) => void;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1)]);
      if (cmd === "pause_torrent")
        return new Promise((resolve) => {
          resolvePause = resolve;
        });
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(1)]);
    const { result, unmount } = renderHook(() => usePauseTorrent(), { wrapper: Wrapper });
    result.current.mutate({ id: 1, infoHash: "hash-1" });
    result.current.mutate({ id: 1, infoHash: "hash-1" });
    await waitFor(() =>
      expect(invokeMock.mock.calls.filter(([cmd]) => cmd === "pause_torrent")).toHaveLength(1)
    );
    resolvePause("ok");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useTorrentStore.getState().opInFlight[1]).toBeUndefined();
    unmount();
  });
});

describe("useRemoveTorrent", () => {
  it("removes id 0, a valid first-session torrent id", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "remove_torrent") return Promise.resolve("ok");
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(0)]);
    const { result, unmount } = renderHook(() => useRemoveTorrent(), { wrapper: Wrapper });
    const removed = await result.current.mutateAsync({ id: 0, deleteFiles: false });
    expect(removed).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("remove_torrent", {
      deleteFiles: false,
      id: 0,
      infoHash: undefined,
    });
    unmount();
  });

  it("ignores a non-integer id without invoking", async () => {
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useRemoveTorrent(), { wrapper: Wrapper });
    const removed = await result.current.mutateAsync({ id: Number.NaN, deleteFiles: true });
    expect(removed).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps the row on backend failure", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1)]);
      if (cmd === "remove_torrent") return Promise.reject(new Error("locked"));
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(1)]);
    const { result, unmount } = renderHook(() => useRemoveTorrent(), { wrapper: Wrapper });
    const removed = await result.current.mutateAsync({ id: 1, deleteFiles: true });
    expect(removed).toBe(false);
    expect(client.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY)).toHaveLength(1);
    unmount();
  });

  it("splices the row and evicts files on success", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_torrents") return Promise.resolve([torrent(1), torrent(2)]);
      if (cmd === "remove_torrent") return Promise.resolve("ok");
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(1), torrent(2)]);
    client.setQueryData(torrentFilesKey(1), [{ index: 0 }]);
    useTorrentStore.setState({ lastActiveAt: { 1: 5, 2: 5 } });
    const { result, unmount } = renderHook(() => useRemoveTorrent(), { wrapper: Wrapper });
    const removed = await result.current.mutateAsync({
      id: 1,
      deleteFiles: true,
      infoHash: "hash-1",
    });
    expect(removed).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("remove_torrent", {
      deleteFiles: true,
      id: 1,
      infoHash: "hash-1",
    });
    expect(client.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY)?.map((t) => t.id)).toEqual([2]);
    expect(client.getQueryData(torrentFilesKey(1))).toBeUndefined();
    expect(useTorrentStore.getState().lastActiveAt).toEqual({ 2: 5 });
    unmount();
  });
});

describe("useRedownloadFile", () => {
  it("refetches files for the new id", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "redownload_file") return Promise.resolve(7);
      if (cmd === "get_running_torrent_files") return Promise.resolve([{ index: 0 }]);
      return Promise.resolve(undefined);
    });
    const { Wrapper, client } = wrapper();
    const { result, unmount } = renderHook(() => useRedownloadFile(), { wrapper: Wrapper });
    renderHook(() => useTorrentFiles(7), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({ id: 7, fileIndex: 0, infoHash: "hash-7" });
    await waitFor(() => expect(client.getQueryData(torrentFilesKey(7))).toEqual([{ index: 0 }]));
    unmount();
  });
});

describe("useTorrentFilesMap", () => {
  it("fetches id 0 and surfaces per-id errors", async () => {
    invokeMock.mockImplementation((cmd: string, vars: unknown) => {
      if (cmd !== "get_running_torrent_files") return Promise.resolve(undefined);
      const id =
        typeof vars === "object" && vars !== null && "id" in vars && typeof vars.id === "number"
          ? vars.id
          : -1;
      if (id === 1) return Promise.reject(new Error("gone"));
      return Promise.resolve([{ index: 0 }]);
    });
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useTorrentFilesMap([0, 1]), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.files[0]).toEqual([{ index: 0 }]));
    await waitFor(() => expect(result.current.errors[1]).toBe("gone"));
    expect(invokeMock).toHaveBeenCalledWith("get_running_torrent_files", { id: 0 });
    unmount();
  });
});
