import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TorrentCategoryEntry } from "@/routes/components/player/category/entry.category";
import { patchSettings } from "@/store/settings.store";
import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent/torrent";

import { mockInvoke } from "@/tests/mocks";

const SAVE_DIR = "D:/media/anime";

const torrent = (overrides: Partial<TorrentInfo> = {}): TorrentInfo => {
  return {
    id: 1,
    name: "Test release",
    info_hash: "hash-1",
    total_bytes: 1000,
    progress_bytes: 100,
    uploaded_bytes: 0,
    share_ratio: 0,
    download_speed: 1024 * 1024,
    upload_speed: 0,
    peers_connected: 4,
    progress: 0.1,
    state: "live",
    eta_secs: 90,
    finished: false,
    error: null,
    save_dir: SAVE_DIR,
    sequential_download: false,
    sequential_file: null,
    download_order: [],
    missing_files: false,
    external_changes: false,
    external_changed_files: [],
    ...overrides,
  };
};

const file = (index: number, name: string, completed = true): TorrentFileInfo => {
  return {
    index,
    name,
    size: 10,
    progress_bytes: completed ? 10 : 0,
    completed,
    selected: true,
    priority: "normal",
    exists: true,
  };
};

const renderEntry = (torrentFilesMap: Record<number, TorrentFileInfo[] | undefined>) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TorrentCategoryEntry tor={torrent()} torrentFilesMap={torrentFilesMap} />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) =>
    command === "scan_extra_files" ? Promise.resolve([]) : Promise.resolve(undefined)
  );
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("TorrentCategoryEntry", () => {
  it("shows a progress state instead of nothing while no file is finished", () => {
    renderEntry({ 1: [] });

    expect(screen.getByText("Downloading")).toBeDefined();
    expect(screen.getByText("10%")).toBeDefined();
    expect(screen.getByText("No files ready to play")).toBeDefined();
  });

  it("stays hidden until the file list is known", () => {
    const { container } = renderEntry({});

    expect(container.textContent).toBe("");
  });

  it("renders the finished files list when a file is ready", () => {
    renderEntry({ 1: [file(0, "A/a.mkv")] });

    expect(screen.queryByText("No files ready to play")).toBeNull();
    expect(document.querySelector("[data-tree-root]")).not.toBeNull();
  });
});
