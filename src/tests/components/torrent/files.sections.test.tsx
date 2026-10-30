import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 20,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 20, key: index })),
    scrollToIndex: () => undefined,
    measureElement: () => undefined,
  }),
}));

import { TorrentFiles } from "@/routes/components/torrent/sections/files.sections";
import { patchSettings } from "@/store/settings.store";
import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent/torrent";

import { mockInvoke } from "@/tests/mocks";

const SAVE_DIR = "D:/media/anime";
const GB = 1024 * 1024 * 1024;

const item = (overrides: Partial<TorrentInfo> = {}): TorrentInfo => {
  return {
    id: 1,
    name: "Test release",
    info_hash: "hash-1",
    total_bytes: 2 * GB,
    progress_bytes: 1024,
    uploaded_bytes: 0,
    share_ratio: 0,
    download_speed: 0,
    upload_speed: 0,
    peers_connected: 0,
    progress: 0,
    state: "live",
    eta_secs: null,
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

const file = (
  index: number,
  name: string,
  overrides: Partial<TorrentFileInfo> = {}
): TorrentFileInfo => {
  return {
    index,
    name,
    size: GB,
    progress_bytes: 0,
    on_disk_bytes: 0,
    completed: false,
    selected: true,
    priority: "normal",
    exists: true,
    ...overrides,
  };
};

const renderFiles = (
  props: { item?: TorrentInfo; files?: TorrentFileInfo[]; expanded?: boolean } = {}
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TorrentFiles
        item={props.item ?? item()}
        files={props.files ?? []}
        isExpanded={props.expanded ?? true}
        onToggleExpand={vi.fn()}
        onResume={vi.fn()}
        onUpdateFiles={vi.fn()}
        onFilePriorityChange={vi.fn()}
        onApplyQueue={async () => true}
        onRedownload={vi.fn()}
        onUpdateRequest={vi.fn()}
      />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  patchSettings({ language: "en" });
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "get_torrent_limits") {
      return Promise.resolve({ downloadBps: null, uploadBps: null });
    }
    if (command === "get_torrent_source") return Promise.resolve(null);
    return Promise.resolve(undefined);
  });
});

afterEach(cleanup);

describe("TorrentFiles disk usage", () => {
  it("sums what the selected payloads occupy and what they will occupy", () => {
    renderFiles({
      files: [
        file(0, "S1/01.mkv", { on_disk_bytes: 100 * 1024 }),
        file(1, "S1/02.mkv", { on_disk_bytes: 0 }),
      ],
    });

    expect(screen.getByTestId("torrent-disk-usage").textContent).toBe(
      "On disk: 100.0 KB of 2.00 GB"
    );
  });

  it("counts only the selected payloads", () => {
    renderFiles({
      files: [
        file(0, "S1/01.mkv", { on_disk_bytes: 512 * 1024 }),
        file(1, "S1/02.mkv", { selected: false, size: 4 * GB }),
      ],
    });

    expect(screen.getByTestId("torrent-disk-usage").textContent).toBe(
      "On disk: 512.0 KB of 1.00 GB"
    );
  });

  it("stays quiet for a finished torrent and outside the expanded section", () => {
    const finished = renderFiles({ files: [file(0, "S1/01.mkv")], item: item({ finished: true }) });
    expect(screen.queryByTestId("torrent-disk-usage")).toBeNull();

    finished.unmount();
    renderFiles({ files: [file(0, "S1/01.mkv")], expanded: false });
    expect(screen.queryByTestId("torrent-disk-usage")).toBeNull();
  });

  it("warns about a volume without sparse files inside the section", () => {
    renderFiles({
      files: [file(0, "S1/01.mkv")],
      item: item({ disk_sparse: false }),
    });

    expect(screen.getByText(/does not support sparse files/)).toBeDefined();
  });
});
