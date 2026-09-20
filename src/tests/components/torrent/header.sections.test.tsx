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
    missing_files: false,
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

describe("TorrentHeader actions", () => {
  function header() {
    return (
      <TorrentHeader
        item={info()}
        selected={false}
        onSelectChange={() => {}}
        isLive
        isPaused={false}
        busy={false}
        queue={null}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={() => {}}
        onRecheck={() => {}}
        onDelete={() => {}}
        onPeers={() => {}}
      />
    );
  }

  it("has no expand control; expansion lives in the files row", () => {
    render(header());
    expect(screen.queryByTitle("Limits KB/s:")).toBeNull();
    expect(screen.getByTitle("Pause download")).toBeTruthy();
  });

  it("toggles selection without touching the row actions", async () => {
    const user = userEvent.setup();
    const onSelectChange = vi.fn();
    render(
      <TorrentHeader
        item={info()}
        selected={false}
        onSelectChange={onSelectChange}
        isLive
        isPaused={false}
        busy={false}
        queue={null}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={() => {}}
        onRecheck={() => {}}
        onPeers={() => {}}
        onDelete={() => {}}
      />
    );
    await user.click(screen.getByRole("checkbox", { name: "Select torrent" }));
    expect(onSelectChange).toHaveBeenCalledWith(true);
  });

  it("asks for delete confirmation through onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <TorrentHeader
        item={info()}
        selected={false}
        onSelectChange={() => {}}
        isLive
        isPaused={false}
        busy={false}
        queue={null}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={() => {}}
        onRecheck={() => {}}
        onPeers={() => {}}
        onDelete={onDelete}
      />
    );
    await user.click(screen.getByTitle("Delete torrent"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("TorrentHeader queue controls", () => {
  function header(queue: { index: number; total: number }, onMove: (delta: -1 | 1) => void) {
    return (
      <TorrentHeader
        item={info()}
        selected={false}
        onSelectChange={() => {}}
        isLive
        isPaused={false}
        busy={false}
        queue={{ ...queue, onMove }}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={() => {}}
        onRecheck={() => {}}
        onDelete={() => {}}
        onPeers={() => {}}
      />
    );
  }

  it("moves up and down through the queue", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(header({ index: 1, total: 3 }, onMove));

    await user.click(screen.getByTitle("Move up"));
    await user.click(screen.getByTitle("Move down"));

    expect(onMove).toHaveBeenNthCalledWith(1, -1);
    expect(onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables the edges", () => {
    const { unmount } = render(header({ index: 0, total: 2 }, () => {}));
    expect((screen.getByTitle("Move up") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle("Move down") as HTMLButtonElement).disabled).toBe(false);
    unmount();
    render(header({ index: 1, total: 2 }, () => {}));
    expect((screen.getByTitle("Move down") as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides queue buttons without a queue", () => {
    render(
      <TorrentHeader
        item={info()}
        selected={false}
        onSelectChange={() => {}}
        isLive
        isPaused={false}
        busy={false}
        queue={null}
        onPause={() => {}}
        onResume={() => {}}
        onSeedChange={() => {}}
        onSetSequential={() => {}}
        onRecheck={() => {}}
        onDelete={() => {}}
        onPeers={() => {}}
      />
    );
    expect(screen.queryByTitle("Move up")).toBeNull();
  });
});
