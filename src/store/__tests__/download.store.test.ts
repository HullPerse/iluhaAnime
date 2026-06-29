import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTorrentStore } from "../download.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockReturnValue(Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

describe("useTorrentStore", () => {
  beforeEach(() => {
    useTorrentStore.setState({
      torrents: [],
      dlLimit: null,
      ulLimit: null,
      lastSaveDir: "",
      pendingTorrent: null,
      preparingTorrent: false,
      torrentFilesMap: {},
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
      preparingTorrent: true,
      pendingTorrent: {
        magnet: "magnet:?xt=urn:btih:test",
        id: 1,
        name: "Test Torrent",
        files: [],
        conflictingFiles: [],
        hasCommonFolder: false,
      },
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

  it("setSequentialDownload updates local torrent state", async () => {
    useTorrentStore.setState({
      torrents: [{
        id: 1, name: "Test",
        info_hash: "", total_bytes: 0, progress_bytes: 0,
        uploaded_bytes: 0, download_speed: 0, upload_speed: 0,
        peers_connected: 0, progress: 0, state: "live",
        eta_secs: null, finished: false, error: null,
        save_dir: "", sequential_download: false,
      }],
    });
    await useTorrentStore.getState().setSequentialDownload(1, true);
    const state = useTorrentStore.getState();
    expect(state.torrents[0].sequential_download).toBe(true);
  });
});
