import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BufferingOverlay from "@/routes/components/player/media/buffering.player";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

const SHOW_DELAY_MS = 400;

beforeEach(() => {
  patchSettings({ language: "en" });
  vi.useFakeTimers();
  streamSession.set({} as StreamOpen);
  playbackAtoms.cacheDuration.set(12);
  playbackAtoms.cacheSpeed.set(2_097_152);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  streamSession.set(null);
  playbackAtoms.cacheDuration.set(undefined);
  playbackAtoms.cacheSpeed.set(undefined);
});

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("BufferingOverlay", () => {
  it("stays out of the frozen frame when playback is fine", () => {
    const { container } = render(<BufferingOverlay visible={false} />);
    advance(SHOW_DELAY_MS);
    expect(container.innerHTML).toBe("");
  });

  it("waits out a short stall instead of flashing on it", () => {
    render(<BufferingOverlay visible />);
    expect(screen.queryByRole("status")).toBeNull();

    advance(SHOW_DELAY_MS - 1);
    expect(screen.queryByRole("status")).toBeNull();

    advance(1);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Buffering")).toBeTruthy();
  });

  it("reports the loaded span and the fill rate instead of a fake percentage", () => {
    render(<BufferingOverlay visible />);
    advance(SHOW_DELAY_MS);

    const detail = screen.getByRole("status").textContent ?? "";
    expect(detail).toContain("0:12 ahead");
    expect(detail).toContain("2.0 MB/s");
    // `cache-buffering-state` is the fill level until mpv unpauses, not progress.
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("says the file is being read for a local source", () => {
    streamSession.set(null);
    render(<BufferingOverlay visible />);
    advance(SHOW_DELAY_MS);

    expect(screen.getByText("Reading file")).toBeTruthy();
    expect(screen.queryByText(/ahead/)).toBeNull();
  });

  it("calls a long wait a stall and names its length", () => {
    render(<BufferingOverlay visible />);
    advance(SHOW_DELAY_MS);
    advance(12_000);

    expect(screen.getByText("No data for 12 s")).toBeTruthy();
  });

  it("keeps the overlay up long enough not to blink", () => {
    const { rerender } = render(<BufferingOverlay visible />);
    advance(SHOW_DELAY_MS);
    expect(screen.getByRole("status")).toBeTruthy();

    rerender(<BufferingOverlay visible={false} />);
    expect(screen.getByRole("status")).toBeTruthy();

    // The stall had already been on screen longer than the minimum here.
    advance(SHOW_DELAY_MS);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
