import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteTorrentDialog } from "@/routes/components/torrent/sections/delete.sections";
import { patchSettings } from "@/store/settings.store";

const dialog = (overrides: Partial<Parameters<typeof DeleteTorrentDialog>[0]> = {}) => {
  return (
    <DeleteTorrentDialog
      open
      message="Delete the torrent?"
      onWithFiles={vi.fn()}
      onKeepFiles={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  );
};

describe("DeleteTorrentDialog", () => {
  beforeEach(() => {
    patchSettings({ language: "en" });
  });

  afterEach(() => {
    cleanup();
  });

  it("explains the unfinished payload and renames the keep action", () => {
    render(
      dialog({
        note: "Unfinished: 3 MB on disk. Keeping the files leaves a partial.",
        keepLabel: "Keep unfinished files",
      })
    );

    expect(screen.getByText(/Unfinished: 3 MB on disk/)).toBeDefined();
    expect(screen.getByText("Keep unfinished files")).toBeDefined();
  });

  it("keeps the generic wording for a finished torrent", () => {
    render(dialog());

    expect(screen.queryByText(/Unfinished:/)).toBeNull();
    expect(screen.getByText("Keep files")).toBeDefined();
  });
});
