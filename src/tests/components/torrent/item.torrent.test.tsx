import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { areTorrentItemsEqual } from "@/lib/torrentItem.utils";
import TorrentItem from "@/routes/components/torrent/item.torrent";
import { patchSettings } from "@/store/settings.store";
import type { TorrentInfo, TorrentItemProps } from "@/types/torrent";

import { mockInvoke } from "../../mocks";

function info(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    download_order: [],
    download_speed: 0,
    error: null,
    eta_secs: null,
    finished: false,
    id: 1,
    info_hash: "hash-1",
    missing_files: false,
    external_changes: false,
    external_changed_files: [],
    name: "Test",
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
  };
}

function props(overrides: Partial<TorrentItemProps> = {}): TorrentItemProps {
  return {
    busy: false,
    files: undefined,
    isExpanded: false,
    item: info(),
    onFilePriorityChange: () => {},
    onPause: () => {},
    onRecheck: () => {},
    onRecheckPaused: () => {},
    onRedownload: () => {},
    onRecreate: () => {},
    onRemove: () => {},
    onResume: () => {},
    onSeedChange: () => {},
    onSelectChange: () => {},
    onApplyQueue: async () => true,
    onSetSequential: () => {},
    onToggleExpand: () => {},
    onUpdateFiles: () => {},
    onUpdateRequest: () => {},
    queue: null,
    selected: false,
    ...overrides,
  };
}

function renderItem(overrides: Partial<TorrentItemProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DndContext>
        <TorrentItem {...props(overrides)} />
      </DndContext>
    </QueryClientProvider>
  );
}

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

describe("TorrentItem sparse warning", () => {
  it("warns while the file section is collapsed", () => {
    renderItem({ item: info({ disk_sparse: false }) });

    expect(screen.getByTestId("torrent-sparse-warning").textContent).toMatch(
      /does not support sparse files/
    );
  });

  it("hands the warning over to the expanded section", () => {
    renderItem({ item: info({ disk_sparse: false }), isExpanded: true });

    expect(screen.queryByTestId("torrent-sparse-warning")).toBeNull();
    expect(screen.getByText(/does not support sparse files/)).toBeDefined();
  });

  it("stays quiet on a volume that supports sparse files", () => {
    renderItem({ item: info({ disk_sparse: true }) });

    expect(screen.queryByTestId("torrent-sparse-warning")).toBeNull();
  });
});

describe("areTorrentItemsEqual", () => {
  it("keeps equal rows memoized", () => {
    expect(areTorrentItemsEqual(props(), props())).toBe(true);
  });

  it("repaints on rename, save dir change, and busy flip", () => {
    const base = props();
    expect(areTorrentItemsEqual(base, props({ item: info({ name: "Renamed" }) }))).toBe(false);
    expect(areTorrentItemsEqual(base, props({ item: info({ save_dir: "/other" }) }))).toBe(false);
    expect(areTorrentItemsEqual(base, props({ busy: true }))).toBe(false);
  });

  it("repaints when the row is selected or deselected", () => {
    const base = props();
    expect(areTorrentItemsEqual(base, props({ selected: true }))).toBe(false);
    expect(areTorrentItemsEqual(props({ selected: true }), props({ selected: true }))).toBe(true);
  });

  it("repaints when the file under the initial check changes", () => {
    const base = props({ item: info({ state: "initializing", checking_file: "Show/E01.mkv" }) });
    expect(
      areTorrentItemsEqual(
        base,
        props({ item: info({ state: "initializing", checking_file: "Show/E02.mkv" }) })
      )
    ).toBe(false);
  });

  it("repaints when a check reports the files gone", () => {
    const base = props();
    expect(areTorrentItemsEqual(base, props({ item: info({ missing_files: true }) }))).toBe(false);
  });

  it("repaints when the files error appears", () => {
    const base = props();
    expect(areTorrentItemsEqual(base, props({ filesError: "gone" }))).toBe(false);
    expect(areTorrentItemsEqual(props({ filesError: "gone" }), props({ filesError: "gone" }))).toBe(
      true
    );
  });

  it("repaints on queue moves and ignores callback identity", () => {
    const move = () => {};
    const queued = props({ queue: { index: 0, total: 2, onMove: move } });
    expect(
      areTorrentItemsEqual(queued, props({ queue: { index: 1, total: 2, onMove: () => {} } }))
    ).toBe(false);
    expect(
      areTorrentItemsEqual(queued, props({ queue: { index: 0, total: 2, onMove: () => {} } }))
    ).toBe(true);
  });
});
