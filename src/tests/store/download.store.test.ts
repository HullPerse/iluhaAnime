import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useTorrentStore } from "@/store/download.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockReturnValue(Promise.resolve()),
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

});
