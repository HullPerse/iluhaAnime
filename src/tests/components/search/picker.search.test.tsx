import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import type { PickerTorrent, TorrentInfo } from "@/types/torrent/torrent";

const TORRENT: PickerTorrent = {
  id: 1,
  name: "Pack",
  files: [
    {
      name: "Season 1/ep01.mkv",
      index: 0,
      completed: false,
      selected: true,
      priority: "normal",
      exists: false,
      size: 100,
      progress_bytes: 0,
    },
    {
      name: "Season 1/ep02.mkv",
      index: 1,
      completed: false,
      selected: true,
      priority: "normal",
      exists: false,
      size: 200,
      progress_bytes: 0,
    },
    {
      name: "info.nfo",
      index: 2,
      completed: false,
      selected: false,
      priority: "normal",
      exists: false,
      size: 10,
      progress_bytes: 0,
    },
  ],
  conflictingFiles: [],
  hasCommonFolder: false,
  seeders: 5,
};

const renderPicker = () => {
  return render(
    <TorrentFilePicker
      torrent={TORRENT}
      defaultSaveDir="C:\\Dl"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  );
};

afterEach(cleanup);

describe("TorrentFilePicker files", () => {
  it("shows per-type icons and the selected count", () => {
    renderPicker();
    expect(document.body.textContent).toContain("2 files");
    const icons = document.querySelectorAll('img[src$=".ico"]');
    expect(icons.length).toBeGreaterThanOrEqual(3);
  });

  it("toggles a whole folder from its header", async () => {
    const user = userEvent.setup();
    renderPicker();
    const folder = screen.getByRole("button", { name: /Season 1/ });
    expect(folder.getAttribute("aria-pressed")).toBe("true");
    await user.click(folder);
    expect(document.body.textContent).toContain("0 files");
    expect(folder.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles a single file checkbox", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("checkbox", { name: "ep01.mkv" }));
    expect(document.body.textContent).toContain("1 file");
  });
});

describe("TorrentFilePicker duplicate guard", () => {
  const HASH = "0123456789abcdef0123456789abcdef01234567";

  const existing = (): TorrentInfo[] => {
    return [
      {
        download_order: [],
        download_speed: 0,
        error: null,
        eta_secs: null,
        finished: false,
        id: 7,
        info_hash: HASH,
        missing_files: false,
        external_changes: false,
        external_changed_files: [],
        name: "Already Here",
        peers_connected: 0,
        progress: 1,
        progress_bytes: 100,
        save_dir: "C:\\Dl",
        sequential_download: false,
        sequential_file: null,
        share_ratio: 2,
        state: "live",
        total_bytes: 100,
        upload_speed: 0,
        uploaded_bytes: 200,
      },
    ];
  };

  const renderDuplicate = (magnet: string | undefined, list: TorrentInfo[]) => {
    return render(
      <TorrentFilePicker
        torrent={{ ...TORRENT, magnet }}
        defaultSaveDir="C:\\Dl"
        existingTorrents={list}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
  };

  it("blocks the download when the magnet hash is already registered", () => {
    renderDuplicate(`magnet:?xt=urn:btih:${HASH}`, existing());
    expect(screen.getByRole("alert").textContent).toContain("Already Here");
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("allows a different hash with the same name", () => {
    renderDuplicate("magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff", existing());
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it("stays quiet without a magnet or library", () => {
    renderDuplicate(undefined, existing());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
