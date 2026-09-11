import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentHeader } from "@/routes/components/torrent/sections/header.sections";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentInfo } from "@/types/torrent";

function info(): TorrentInfo {
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
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("TorrentHeader throttle toggle", () => {
  it("expands the card to the limits editor", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    render(
      <TorrentHeader
        item={info()}
        isLive
        isPaused={false}
        busy={false}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={() => {}}
        onRecheck={() => {}}
        onDelete={() => {}}
        onToggleExpand={onToggleExpand}
      />
    );

    await user.click(screen.getByTitle("Limits KB/s:"));

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });
});
