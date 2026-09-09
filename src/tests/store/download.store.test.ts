import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useTorrentStore } from "@/store/download.store";
import type { TorrentFileInfo } from "@/types/torrent";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockReturnValue(Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

describe("useTorrentStore", () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    useTorrentStore.setState({
      limits: { download: null, upload: null },
      pendingTorrent: null,
      preparingTorrent: false,
      torrentFilesMap: {},
      torrents: [],
    });
  });

  it("cancelDownload clears pendingTorrent", async () => {
    useTorrentStore.setState({
      pendingTorrent: {
        conflictingFiles: [],
        files: [],
        hasCommonFolder: false,
        id: 1,
        magnet: "magnet:?xt=urn:btih:test",
        name: "Test Torrent",
      },
      preparingTorrent: true,
    });
    await useTorrentStore.getState().cancelDownload();
    const state = useTorrentStore.getState();
    expect(state.preparingTorrent).toBe(false);
    expect(state.pendingTorrent).toBeNull();
  });

  it("setSpeedLimits updates local state", async () => {
    await useTorrentStore.getState().setSpeedLimits({ download: 500, upload: 100 });
    const state = useTorrentStore.getState();
    expect(state.limits).toEqual({ download: 500, upload: 100 });
  });

  it("setSpeedLimits with null clears limits", async () => {
    useTorrentStore.setState({ limits: { download: 500, upload: 100 } });
    await useTorrentStore.getState().setSpeedLimits({ download: null, upload: null });
    const state = useTorrentStore.getState();
    expect(state.limits).toEqual({ download: null, upload: null });
  });

  it("deduplicates concurrent file metadata requests", async () => {
    const file: TorrentFileInfo = {
      completed: true,
      exists: true,
      index: 0,
      name: "episode.mkv",
      priority: "normal",
      progress_bytes: 100,
      selected: true,
      size: 100,
    };
    let resolveRequest!: (files: TorrentFileInfo[]) => void;
    const request = new Promise<TorrentFileInfo[]>((resolve) => {
      resolveRequest = resolve;
    });
    invokeMock.mockImplementation(() => request as never);

    const first = useTorrentStore.getState().loadTorrentFiles(7);
    const second = useTorrentStore.getState().loadTorrentFiles(7);

    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    resolveRequest([file]);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(useTorrentStore.getState().torrentFilesMap[7]).toEqual([file]);
  });

  it("setSequentialDownload updates local torrent state", async () => {
    useTorrentStore.setState({
      torrents: [
        {
          download_speed: 0,
          error: null,
          eta_secs: null,
          finished: false,
          id: 1,
          info_hash: "",
          name: "Test",
          peers_connected: 0,
          progress: 0,
          progress_bytes: 0,
          save_dir: "",
          sequential_download: false,
          share_ratio: 0,
          state: "live",
          total_bytes: 0,
          upload_speed: 0,
          uploaded_bytes: 0,
        },
      ],
    });
    await useTorrentStore.getState().setSequentialDownload(1, true);
    const state = useTorrentStore.getState();
    expect(state.torrents[0].sequential_download).toBe(true);
  });

  it("removeTorrent ignores id 0 without invoking", async () => {
    const removed = await useTorrentStore.getState().removeTorrent(0, true);
    expect(removed).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("removeTorrent keeps the row and files on backend failure", async () => {
    invokeMock.mockRejectedValueOnce(new Error("torrent with id 1 did not exist"));
    const file = {
      completed: false,
      exists: true,
      index: 0,
      name: "episode.mkv",
      priority: "normal" as const,
      progress_bytes: 10,
      selected: true,
      size: 100,
    };
    useTorrentStore.setState({
      torrents: [
        {
          download_speed: 0,
          error: null,
          eta_secs: null,
          finished: false,
          id: 1,
          info_hash: "hash-1",
          name: "Test",
          peers_connected: 0,
          progress: 0,
          progress_bytes: 0,
          save_dir: "",
          sequential_download: false,
          share_ratio: 0,
          state: "live",
          total_bytes: 0,
          upload_speed: 0,
          uploaded_bytes: 0,
        },
      ],
      torrentFilesMap: { 1: [file] },
    });
    const removed = await useTorrentStore.getState().removeTorrent(1, true);
    expect(removed).toBe(false);
    const state = useTorrentStore.getState();
    expect(state.torrents).toHaveLength(1);
    expect(state.torrentFilesMap[1]).toEqual([file]);
  });

  it("removeTorrent splices the row and evicts files on success", async () => {
    const first = {
      download_speed: 0,
      error: null,
      eta_secs: null,
      finished: false,
      id: 1,
      info_hash: "hash-1",
      name: "First",
      peers_connected: 0,
      progress: 0,
      progress_bytes: 0,
      save_dir: "",
      sequential_download: false,
      share_ratio: 0,
      state: "live",
      total_bytes: 0,
      upload_speed: 0,
      uploaded_bytes: 0,
    };
    const second = { ...first, id: 2, info_hash: "hash-2", name: "Second" };
    useTorrentStore.setState({
      torrents: [first, second],
      torrentFilesMap: {},
      lastActiveAt: { 1: 5, 2: 5 },
    });
    const removed = await useTorrentStore.getState().removeTorrent(1, true, "hash-1");
    expect(removed).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("remove_torrent", {
      deleteFiles: true,
      id: 1,
      infoHash: "hash-1",
    });
    const state = useTorrentStore.getState();
    expect(state.torrents.map((t) => t.id)).toEqual([2]);
    expect(state.lastActiveAt).toEqual({ 2: 5 });
  });

  it("pauseTorrent sends a single invoke for double clicks", async () => {
    let resolvePause!: (value: unknown) => void;
    invokeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePause = resolve;
        }) as never
    );
    const store = useTorrentStore.getState();
    const first = store.pauseTorrent(1, "hash-1");
    const second = store.pauseTorrent(1, "hash-1");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    resolvePause(undefined);
    await first;
    await second;
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenNthCalledWith(2, "list_torrents", undefined);
    const state = useTorrentStore.getState();
    expect(state.opInFlight).toEqual({});
  });

  it("refreshTorrents replaces the list and prunes stamps", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        download_speed: 0,
        error: null,
        eta_secs: null,
        finished: false,
        id: 2,
        info_hash: "hash-2",
        name: "Second",
        peers_connected: 0,
        progress: 0,
        progress_bytes: 0,
        save_dir: "",
        sequential_download: false,
        share_ratio: 0,
        state: "live",
        total_bytes: 0,
        upload_speed: 0,
        uploaded_bytes: 0,
      },
    ]);
    useTorrentStore.setState({
      torrents: [],
      lastActiveAt: { 1: 5 },
    });
    await useTorrentStore.getState().refreshTorrents();
    const state = useTorrentStore.getState();
    expect(state.torrents.map((t) => t.id)).toEqual([2]);
    expect(state.lastActiveAt).toEqual({});
  });

  it("redownloadFile reloads files without a cached map entry", async () => {
    const file = {
      completed: false,
      exists: true,
      index: 0,
      name: "episode.mkv",
      priority: "normal" as const,
      progress_bytes: 10,
      selected: true,
      size: 100,
    };
    invokeMock.mockResolvedValueOnce(7).mockResolvedValueOnce([file]);
    useTorrentStore.setState({ torrentFilesMap: {} });
    await useTorrentStore.getState().redownloadFile(7, 0, "hash-7");
    expect(invokeMock).toHaveBeenCalledWith("get_running_torrent_files", { id: 7 });
    expect(useTorrentStore.getState().torrentFilesMap[7]).toEqual([file]);
  });
});
