import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import type { PickerTorrent } from "@/types/torrent";

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

function renderPicker() {
  return render(
    <TorrentFilePicker
      torrent={TORRENT}
      defaultSaveDir="C:\\Dl"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

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
