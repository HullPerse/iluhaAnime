import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTorrentBulkDialogs } from "@/hooks/torrent/bulk.hook";
import type { TorrentInfo } from "@/types/torrent/torrent";

const torrent = (id: number): TorrentInfo => ({
  id,
  name: `torrent-${id}`,
  info_hash: `hash-${id}`,
  total_bytes: 100,
  progress_bytes: 0,
  uploaded_bytes: 0,
  share_ratio: 0,
  download_speed: 0,
  upload_speed: 0,
  peers_connected: 0,
  progress: 0,
  state: "downloading",
  eta_secs: null,
  finished: false,
  error: null,
  save_dir: "D:/Downloads",
  sequential_download: false,
  sequential_file: null,
  download_order: [],
  missing_files: false,
  external_changes: false,
  external_changed_files: [],
});

const selected = [torrent(1), torrent(2)];

describe("useTorrentBulkDialogs", () => {
  it("confirms removal with the requested delete mode and closes", async () => {
    const runBulk = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTorrentBulkDialogs(selected, runBulk));

    act(() => result.current.requestRemove(selected));
    await act(async () => result.current.confirmRemove(true));

    expect(runBulk).toHaveBeenCalledWith("remove", selected, true);
    expect(result.current.removeTargets).toBeNull();
  });

  it("applies tracker changes to the current selection and closes", async () => {
    const runBulk = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTorrentBulkDialogs(selected, runBulk));

    act(() => result.current.openTrackers());
    expect(result.current.trackersOpen).toBe(true);

    await act(async () => result.current.applyTrackers("udp://tracker.example:80"));

    expect(runBulk).toHaveBeenCalledWith("trackers", selected, false, {
      tracker: "udp://tracker.example:80",
    });
    expect(result.current.trackersOpen).toBe(false);
  });

  it("maps speed limits to the bulk payload and closes", async () => {
    const runBulk = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTorrentBulkDialogs(selected, runBulk));

    act(() => result.current.openLimits());
    expect(result.current.limitsOpen).toBe(true);

    await act(async () => result.current.applyLimits({ download: 1024, upload: null }));

    expect(runBulk).toHaveBeenCalledWith("limits", selected, false, {
      downloadBps: 1024,
      uploadBps: null,
    });
    expect(result.current.limitsOpen).toBe(false);
  });
});
