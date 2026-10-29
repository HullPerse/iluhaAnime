import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import BufferingOverlay from "@/routes/components/player/media/buffering.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ language: "en" });
  playbackAtoms.cacheBufferingState.set(42);
});

afterEach(() => {
  cleanup();
  playbackAtoms.cacheBufferingState.set(undefined);
});

describe("BufferingOverlay", () => {
  it("stays out of the frozen frame when playback is fine", () => {
    const { container } = render(<BufferingOverlay visible={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the loader and cache fill while mpv waits for the network", () => {
    render(<BufferingOverlay visible />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Buffering")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("keeps the label when mpv does not report a fill percentage", () => {
    playbackAtoms.cacheBufferingState.set(undefined);
    render(<BufferingOverlay visible />);

    expect(screen.getByText("Buffering")).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });
});
