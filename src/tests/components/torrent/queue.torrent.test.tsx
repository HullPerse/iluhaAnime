import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentQueueModal } from "@/routes/components/torrent/queue.torrent";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentFileInfo } from "@/types/torrent";

function file(index: number, overrides: Partial<TorrentFileInfo> = {}): TorrentFileInfo {
  return {
    completed: false,
    exists: false,
    index,
    name: `Show - 0${index + 1}.mkv`,
    priority: "normal",
    progress_bytes: 0,
    selected: true,
    size: 1024,
    ...overrides,
  };
}

function renderQueue({
  files,
  order = [],
  current = null,
  onSave = vi.fn(),
  onClose = vi.fn(),
}: {
  files: TorrentFileInfo[];
  order?: number[];
  current?: number | null;
  onSave?: (indices: number[]) => void;
  onClose?: () => void;
}) {
  render(
    <TorrentQueueModal
      files={files}
      order={order}
      current={current}
      onSave={onSave}
      onClose={onClose}
    />
  );
  return { onSave, onClose };
}

const rowNames = () =>
  screen
    .getAllByTestId("torrent-queue-row")
    .map((row) => row.querySelector("span[title]")?.textContent ?? "");

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en", fileOrder: "list" });
});

describe("TorrentQueueModal", () => {
  it("lists what is still coming down, in the saved order", () => {
    renderQueue({
      files: [file(0), file(1), file(2, { completed: true }), file(3, { selected: false })],
      order: [1, 0],
    });

    expect(rowNames()).toEqual(["Show - 02.mkv", "Show - 01.mkv"]);
  });

  it("falls back to the file list order when nothing was arranged", () => {
    renderQueue({
      files: [
        file(0, { name: "Show - 03.mkv" }),
        file(1, { name: "Show - 01.mkv" }),
        file(2, { name: "Show - 02.mkv" }),
      ],
    });

    expect(rowNames()).toEqual(["Show - 01.mkv", "Show - 02.mkv", "Show - 03.mkv"]);
  });

  it("marks the file that is being fetched right now", () => {
    renderQueue({ files: [file(0), file(1)], current: 1 });

    const marked = screen
      .getAllByTestId("torrent-queue-row")
      .filter((row) => within(row).queryByTestId("torrent-queue-current") !== null);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toContain("Show - 02.mkv");
  });

  it("saves the order the arrows produced", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderQueue({ files: [file(0), file(1), file(2)] });

    await user.click(
      within(screen.getAllByTestId("torrent-queue-row")[0]!).getByLabelText("Move down")
    );

    expect(rowNames()).toEqual(["Show - 02.mkv", "Show - 01.mkv", "Show - 03.mkv"]);
    await user.click(screen.getByRole("button", { name: "Save order" }));
    expect(onSave).toHaveBeenCalledWith([1, 0, 2]);
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the arrows inside the list", () => {
    renderQueue({ files: [file(0), file(1)] });

    const rows = screen.getAllByTestId("torrent-queue-row");
    expect(within(rows[0]!).getByLabelText("Move up").hasAttribute("disabled")).toBe(true);
    expect(within(rows[1]!).getByLabelText("Move down").hasAttribute("disabled")).toBe(true);
  });

  it("resets the arrangement and saves the cleared queue", async () => {
    const user = userEvent.setup();
    const { onSave } = renderQueue({
      files: [file(0, { name: "Show - 02.mkv" }), file(1, { name: "Show - 01.mkv" })],
      order: [0, 1],
    });

    await user.click(screen.getByRole("button", { name: "Reset order" }));
    expect(rowNames()).toEqual(["Show - 01.mkv", "Show - 02.mkv"]);

    await user.click(screen.getByRole("button", { name: "Save order" }));
    expect(onSave).toHaveBeenCalledWith([1, 0]);
  });

  it("has nothing to order when no file is selected", async () => {
    const user = userEvent.setup();
    const { onSave } = renderQueue({ files: [file(0, { selected: false })] });

    expect(screen.getByTestId("torrent-queue-empty")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save order" });
    expect(save.hasAttribute("disabled")).toBe(true);
    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});
