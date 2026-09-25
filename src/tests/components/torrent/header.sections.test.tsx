import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentHeader } from "@/routes/components/torrent/sections/header.sections";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentInfo } from "@/types/torrent";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
}));

const SEQUENTIAL_NAME = /Sequential download/;

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
    paused_external_changes: false,
    paused_changed_files: [],
    name: "Test",
    peers_connected: 0,
    progress: 0,
    progress_bytes: 0,
    save_dir: "",
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

function renderHeader(item: TorrentInfo, onSetSequential = vi.fn()) {
  return {
    onSetSequential,
    view: render(
      <TorrentHeader
        item={item}
        selected={false}
        onSelectChange={() => {}}
        isLive
        isPaused={false}
        busy={false}
        queue={null}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={onSetSequential}
        onRecheck={() => {}}
        onPeers={() => {}}
        onDelete={() => {}}
      />
    ),
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("TorrentHeader sequential toggle", () => {
  it("shows no icon when off and a check when on", () => {
    const off = renderHeader(info({ sequential_download: false }));
    const offButton = screen.getByRole("button", { name: SEQUENTIAL_NAME });
    expect(offButton.querySelector("svg")).toBeNull();
    off.view.unmount();
    cleanup();

    renderHeader(info({ sequential_download: true }));
    const onButton = screen.getByRole("button", { name: SEQUENTIAL_NAME });
    expect(onButton.querySelector("svg")).not.toBeNull();
  });

  it("calls onSetSequential with the negated value", async () => {
    const user = userEvent.setup();
    const onSetSequential = vi.fn();
    const { view } = renderHeader(info({ sequential_download: false }), onSetSequential);
    await user.click(screen.getByRole("button", { name: SEQUENTIAL_NAME }));
    expect(onSetSequential).toHaveBeenCalledWith(true);
    view.unmount();
    cleanup();

    const second = vi.fn();
    renderHeader(info({ sequential_download: true }), second);
    await user.click(screen.getByRole("button", { name: SEQUENTIAL_NAME }));
    expect(second).toHaveBeenCalledWith(false);
  });
});
