import type { Update } from "@tauri-apps/plugin-updater";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useCell } from "@hullperse/hp_utils/react";
import { afterEach, describe, expect, it } from "vitest";

import Updater from "@/components/shared/updater.component";
import { overlayAtoms } from "@/store/overlay.store";
import { patchSettings } from "@/store/settings.store";

const UPDATE = { currentVersion: "5.1.2", version: "5.2.0" } as unknown as Update;

function PassivePromptGate() {
  const overlays = useCell(overlayAtoms.entries);
  return overlays.length === 0 ? (
    <Updater update={UPDATE} onClose={() => undefined} />
  ) : (
    <span>blocked by overlay</span>
  );
}

afterEach(() => {
  cleanup();
});

describe("passive update prompt", () => {
  it("does not register itself into the overlay stack it waits on", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const start = overlayAtoms.entries.get().length;
    render(<PassivePromptGate />);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    expect(overlayAtoms.entries.get()).toHaveLength(start);
    expect(screen.queryByText("blocked by overlay")).toBeNull();
  });
});
