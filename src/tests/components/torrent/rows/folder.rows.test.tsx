import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FolderRow } from "@/routes/components/torrent/rows/folder.rows";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentFileInfo, TorrentTreeNode } from "@/types/torrent";

function file(index: number, overrides: Partial<TorrentFileInfo> = {}): TorrentFileInfo {
  return {
    completed: false,
    exists: false,
    index,
    name: `Season 1/Show - 0${index + 1}.mkv`,
    priority: "normal",
    progress_bytes: 0,
    selected: true,
    size: 1024,
    ...overrides,
  };
}

function node(): TorrentTreeNode {
  return {
    children: [],
    files: [
      {
        completed: false,
        displayName: "Show - 01.mkv",
        exists: false,
        index: 0,
        name: "Season 1/Show - 01.mkv",
        priority: "normal",
        progress_bytes: 0,
        selected: true,
        size: 1024,
      },
      {
        completed: false,
        displayName: "Show - 02.mkv",
        exists: false,
        index: 1,
        name: "Season 1/Show - 02.mkv",
        priority: "normal",
        progress_bytes: 0,
        selected: true,
        size: 1024,
      },
    ],
    name: "Season 1",
  };
}

function row(files: TorrentFileInfo[], onToggleSelection = vi.fn()) {
  render(
    <FolderRow
      node={node()}
      depth={0}
      virtualStart={0}
      files={files}
      isOpen
      type="torrent"
      onToggleFolder={() => {}}
      onToggleSelection={onToggleSelection}
    />
  );
  return { onToggleSelection };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("folder selection checkbox", () => {
  it("asks for every file in the folder when the folder is not fully selected", async () => {
    const user = userEvent.setup();
    const { onToggleSelection } = row([file(0), file(1, { selected: false })]);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
    await user.click(checkbox);

    expect(onToggleSelection).toHaveBeenCalledWith([0, 1], true);
  });

  it("unchecks the whole folder when every file in it is selected", async () => {
    const user = userEvent.setup();
    const { onToggleSelection } = row([file(0), file(1)]);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await user.click(checkbox);

    expect(onToggleSelection).toHaveBeenCalledWith([0, 1], false);
  });

  it("is disabled when there is nothing selectable left in the folder", () => {
    row([file(0, { completed: true }), file(1, { completed: true })]);

    expect(Object.hasOwn(screen.getByRole("checkbox").dataset, "disabled")).toBe(true);
  });
});
