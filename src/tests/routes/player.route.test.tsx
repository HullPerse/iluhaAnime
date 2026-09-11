import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QUERY_CONFIG } from "@/config/store/query.config";
import PlayerRoute from "@/routes/player.route";
import type { TorrentInfo } from "@/types/torrent";

const mockInvoke = vi.fn();
let resolveTorrents: ((value: TorrentInfo[]) => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
  openUrl: vi.fn(),
}));

function torrent(id: number): TorrentInfo {
  return {
    download_speed: 0,
    error: null,
    eta_secs: null,
    finished: false,
    id,
    info_hash: `hash-${id}`,
    name: `Torrent ${id}`,
    peers_connected: 0,
    progress: 0,
    progress_bytes: 0,
    save_dir: "/dl",
    sequential_download: false,
    share_ratio: 0,
    state: "live",
    total_bytes: 1000,
    upload_speed: 0,
    uploaded_bytes: 0,
  } as TorrentInfo;
}

function renderRoute() {
  const queryClient = new QueryClient(QUERY_CONFIG);
  return render(
    <QueryClientProvider client={queryClient}>
      <PlayerRoute />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resolveTorrents = null;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "list_torrents")
      return new Promise<TorrentInfo[]>((resolve) => {
        resolveTorrents = resolve;
      });
    if (cmd === "get_running_torrent_files") return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  resolveTorrents?.([]);
  resolveTorrents = null;
});

describe("PlayerRoute torrent loading", () => {
  it("settles while the torrent list is still loading", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("v9.0")).toBeTruthy());
  });

  it("shows loaded torrents without update loops", async () => {
    renderRoute();
    await waitFor(() => expect(resolveTorrents).not.toBeNull());
    resolveTorrents?.([torrent(0)]);
    await waitFor(() => expect(screen.getByText("Torrent 0")).toBeTruthy());
  });
});
