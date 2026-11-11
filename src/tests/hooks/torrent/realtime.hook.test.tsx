import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Event } from "@tauri-apps/api/event";
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { torrentApi } from "@/api/torrent.api";
import { TORRENTS_QUERY_KEY, useTorrents } from "@/hooks/torrent/queries.hook";
import { useTorrentRealtime } from "@/hooks/torrent/realtime.hook";
import { torrentAtoms } from "@/store/download.store";
import { mockInvoke, mockListen } from "@/tests/mocks";
import type { TorrentInfo } from "@/types/torrent/torrent";

const torrent = (id: number, overrides: Partial<TorrentInfo> = {}): TorrentInfo => ({
  download_order: [],
  download_speed: 0,
  error: null,
  eta_secs: null,
  finished: false,
  id,
  info_hash: `hash-${id}`,
  missing_files: false,
  external_changes: false,
  external_changed_files: [],
  name: `Torrent ${id}`,
  peers_connected: 0,
  progress: 0,
  progress_bytes: 0,
  save_dir: "/dl",
  sequential_download: false,
  sequential_file: null,
  share_ratio: 0,
  state: "live",
  total_bytes: 1000,
  upload_speed: 0,
  uploaded_bytes: 0,
  ...overrides,
});

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const strictWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </StrictMode>
);

const event = (payload: TorrentInfo[]): Event<TorrentInfo[]> => ({
  event: "torrents-update",
  id: 1,
  payload,
});

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  torrentAtoms.opInFlight.set({});
  torrentAtoms.lastActiveAt.set({});
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("useTorrentRealtime", () => {
  it("owns a single app-wide subscription and stops it on unmount", async () => {
    const stop = vi.fn();
    mockListen.mockResolvedValue(stop);

    const { unmount } = renderHook(
      () => useTorrentRealtime({ data: [], error: null }),
      { wrapper }
    );

    await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
    expect(mockListen).toHaveBeenCalledWith("torrents-update", expect.any(Function));

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("keeps one active subscription under StrictMode", async () => {
    let active = 0;
    mockListen.mockImplementation(async () => {
      active += 1;
      return vi.fn(() => {
        active -= 1;
      });
    });

    const { unmount } = renderHook(
      () => useTorrentRealtime({ data: [], error: null }),
      { wrapper: strictWrapper }
    );

    await waitFor(() => expect(active).toBe(1));
    unmount();
    expect(active).toBe(0);
  });

  it("applies the event payload to the query cache without pending removals", async () => {
    let handler: ((payload: Event<TorrentInfo[]>) => void) | undefined;
    mockListen.mockImplementation(async (_name: string, callback: typeof handler) => {
      handler = callback;
      return vi.fn();
    });
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(1)]);

    renderHook(() => useTorrentRealtime({ data: [torrent(1)], error: null }), { wrapper });
    await waitFor(() => expect(handler).toBeDefined());

    torrentAtoms.opInFlight.set({ 1: "remove" });
    act(() => handler?.(event([torrent(1), torrent(2)])));

    const cache = client.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY);
    expect(cache?.map((t) => t.id)).toEqual([2]);
  });

  it("pauses a torrent that just finished in the event payload", async () => {
    const pause = vi.spyOn(torrentApi, "pauseTorrent").mockResolvedValue(undefined);
    let handler: ((payload: Event<TorrentInfo[]>) => void) | undefined;
    mockListen.mockImplementation(async (_name: string, callback: typeof handler) => {
      handler = callback;
      return vi.fn();
    });
    client.setQueryData(TORRENTS_QUERY_KEY, [torrent(4)]);

    renderHook(() => useTorrentRealtime({ data: [torrent(4)], error: null }), { wrapper });
    await waitFor(() => expect(handler).toBeDefined());

    act(() => handler?.(event([torrent(4, { finished: true })])));

    await waitFor(() => expect(pause).toHaveBeenCalledWith(4));
  });

  it("primes the seed pause from the first query result", async () => {
    const pause = vi.spyOn(torrentApi, "pauseTorrent").mockResolvedValue(undefined);

    renderHook(
      () => useTorrentRealtime({ data: [torrent(7, { finished: true })], error: null }),
      { wrapper }
    );

    await waitFor(() => expect(pause).toHaveBeenCalledWith(7));
  });

  it("keeps useTorrents free of the event subscription", async () => {
    mockInvoke.mockResolvedValue([]);

    const { result } = renderHook(() => useTorrents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockListen).not.toHaveBeenCalled();
  });
});
