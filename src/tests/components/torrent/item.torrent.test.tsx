import { describe, it, expect } from "vitest";

import { areTorrentItemsEqual } from "@/routes/components/torrent/item.torrent";
import type { TorrentInfo, TorrentItemProps } from "@/types/torrent";

function info(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
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
    save_dir: "/dl",
    sequential_download: false,
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
    onRedownload: () => {},
    onRemove: () => {},
    onResume: () => {},
    onRetry: () => {},
    onSeedChange: () => {},
    onSetSequential: () => {},
    onToggleExpand: () => {},
    onUpdateFiles: () => {},
    ...overrides,
  };
}

describe("areTorrentItemsEqual", () => {
  it("keeps equal rows memoized", () => {
    expect(areTorrentItemsEqual(props(), props())).toBe(true);
  });

  it("repaints on rename, save dir change, and busy flip", () => {
    const base = props();
    expect(
      areTorrentItemsEqual(base, props({ item: info({ name: "Renamed" }) }))
    ).toBe(false);
    expect(
      areTorrentItemsEqual(base, props({ item: info({ save_dir: "/other" }) }))
    ).toBe(false);
    expect(areTorrentItemsEqual(base, props({ busy: true }))).toBe(false);
  });
});
