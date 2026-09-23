import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { TorrentFileRow } from "@/routes/components/torrent/rows/file.rows";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentTreeFile } from "@/types/torrent";

function file(overrides: Partial<TorrentTreeFile> = {}): TorrentTreeFile {
  return {
    index: 2,
    name: "Show - 03.mkv",
    displayName: "Show - 03.mkv",
    size: 1024,
    progress_bytes: 0,
    completed: false,
    selected: true,
    priority: "normal",
    exists: false,
    ...overrides,
  };
}

function row(sequential: boolean, options: Partial<TorrentTreeFile> = {}, onToggle = vi.fn()) {
  return (
    <TorrentFileRow
      file={file(options)}
      depth={0}
      virtualStart={0}
      type="torrent"
      checked={options.selected ?? true}
      onToggleFile={onToggle}
      queueMap={new Map()}
      sequential={sequential}
    />
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("sequential mode marker on a file row", () => {
  it("marks only the file that is being fetched first", () => {
    const { rerender } = render(row(true));
    const marker = screen.getByTestId("torrent-file-sequential");
    expect(marker.getAttribute("title")).toBe(translate("en", "torrent.sequential.current"));

    rerender(row(false));
    expect(screen.queryByTestId("torrent-file-sequential")).toBeNull();
  });
});

describe("selection on a file row", () => {
  it("toggles the file from its checkbox, which is the only selection control left", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(row(false, {}, onToggle));

    await user.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("leaves the checkbox of a finished file alone", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(row(false, { completed: true }, onToggle));

    const checkbox = screen.getByRole("checkbox");
    expect(Object.hasOwn(checkbox.dataset, "disabled")).toBe(true);
    await user.click(checkbox);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
