import { DndContext } from "@dnd-kit/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TorrentItem from "@/routes/components/torrent/item.torrent";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentInfo, TorrentItemProps } from "@/types/torrent";

function item(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    download_order: [],
    download_speed: 0,
    error: null,
    eta_secs: null,
    finished: false,
    id: 1,
    info_hash: "hash-1",
    missing_files: false,
    paused_external_changes: false,
    paused_changed_files: [],
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

function renderItem(
  queue: TorrentItemProps["queue"],
  overrides: Partial<TorrentInfo> = {},
  onRecheckPaused: () => void = () => {}
) {
  const props: TorrentItemProps = {
    busy: false,
    files: [],
    isExpanded: false,
    item: item(overrides),
    onFilePriorityChange: () => {},
    onPause: () => {},
    onRecheck: () => {},
    onRecheckPaused,
    onRedownload: () => {},
    onRecreate: () => {},
    onRemove: () => {},
    onResume: () => {},
    onSeedChange: () => {},
    onSelectChange: () => {},
    onSetDownloadOrder: () => {},
    onSetSequential: () => {},
    onToggleExpand: () => {},
    onUpdateFiles: () => {},
    queue,
    selected: false,
  };
  return render(
    <DndContext>
      <TorrentItem {...props} />
    </DndContext>
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("dragging a torrent row in the manual order", () => {
  it("shows a drag handle wired to dnd-kit while the order is the user's", () => {
    renderItem({ index: 0, total: 2, onMove: () => {} });

    const handle = screen.getByTestId("torrent-drag-handle");
    expect(handle.getAttribute("role")).toBe("button");
    expect(handle.getAttribute("aria-roledescription")).toBe("draggable");
    expect(screen.getByTitle("Drag to reorder")).toBe(handle);
  });

  it("has no handle for a list sorted by anything else", () => {
    renderItem(null);

    expect(screen.queryByTestId("torrent-drag-handle")).toBeNull();
    expect(screen.queryByTitle("Move up")).toBeNull();
  });
});

describe("the paused external-changes badge", () => {
  it("warns while the files changed outside and names them", () => {
    renderItem(null, {
      state: "paused",
      paused_external_changes: true,
      paused_changed_files: ["Show - 01.mkv", "Show - 02.mkv"],
    });

    const badge = screen.getByTestId("torrent-external-badge");
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.textContent).toContain("Files changed outside the app");
    expect(badge.textContent).toContain("Show - 01.mkv, Show - 02.mkv");
    expect(badge.getAttribute("title")).toContain("Show - 01.mkv, Show - 02.mkv");
  });

  it("warns without names when the watcher has none yet", () => {
    renderItem(null, { state: "paused", paused_external_changes: true });

    const badge = screen.getByTestId("torrent-external-badge");
    expect(badge.textContent).toBe("Files changed outside the app");
  });

  it("shows nothing when the files are untouched", () => {
    renderItem(null, { state: "paused", paused_external_changes: false });

    expect(screen.queryByTestId("torrent-external-badge")).toBeNull();
    expect(screen.queryByText("Recheck now")).toBeNull();
  });

  it("rechecks from the badge without resuming", () => {
    const onRecheckPaused = vi.fn();
    renderItem(null, { state: "paused", paused_external_changes: true }, onRecheckPaused);

    fireEvent.click(screen.getByText("Recheck now"));

    expect(onRecheckPaused).toHaveBeenCalledTimes(1);
  });
});
