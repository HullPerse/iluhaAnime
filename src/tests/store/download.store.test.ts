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
      dlLimit: null,
      lastSaveDir: "",
      pendingTorrent: null,
      preparingTorrent: false,
      torrentFilesMap: {},
      torrents: [],
      ulLimit: null,
    });
  });

  it("starts with default state", () => {
    const state = useTorrentStore.getState();
    expect(state.torrents).toEqual([]);
    expect(state.preparingTorrent).toBe(false);
    expect(state.pendingTorrent).toBeNull();
    expect(state.torrentFilesMap).toEqual({});
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
    await useTorrentStore.getState().setSpeedLimits(500, 100);
    const state = useTorrentStore.getState();
    expect(state.dlLimit).toBe(500);
    expect(state.ulLimit).toBe(100);
  });

  it("setSpeedLimits with null clears limits", async () => {
    useTorrentStore.setState({ dlLimit: 500, ulLimit: 100 });
    await useTorrentStore.getState().setSpeedLimits(null, null);
    const state = useTorrentStore.getState();
    expect(state.dlLimit).toBeNull();
    expect(state.ulLimit).toBeNull();
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
});
