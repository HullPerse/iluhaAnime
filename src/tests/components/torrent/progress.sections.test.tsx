import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TorrentProgress } from "@/routes/components/torrent/sections/progress.sections";
import type { TorrentInfo } from "@/types/torrent";

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
    save_dir: "D:/media",
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

afterEach(cleanup);

describe("TorrentProgress", () => {
  it("shows the checked share and the file being hashed", () => {
    render(
      <TorrentProgress
        item={info({
          state: "initializing",
          progress_bytes: 250,
          progress: 0.25,
          checking_file: "Show/E01.mkv",
        })}
      />
    );

    expect(screen.getByText("Checking files")).toBeDefined();
    expect(screen.getByText(/\(25\.0%\)/)).toBeDefined();
    expect(screen.getByTitle("Show/E01.mkv").textContent).toBe("Checking: Show/E01.mkv");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("250");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe("1000");
  });

  it("keeps the indeterminate bar while metadata is unresolved", () => {
    render(<TorrentProgress item={info({ state: "initializing", total_bytes: 0 })} />);

    expect(screen.getByText("Initializing")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
  });
});
