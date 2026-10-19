import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerSlimBar from "@/routes/components/player/media/slim.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

function props(paused: boolean) {
  return {
    paused,
    hasFile: true,
    duration: 1421,
    chapters: [],
    seekTarget: null,
    onPlayPause: vi.fn(),
    onScrub: vi.fn(),
    onCommitSeek: vi.fn(),
  };
}

beforeEach(() => {
  patchSettings({ language: "en" });
  playbackAtoms.timePos.set(754);
});

afterEach(() => {
  cleanup();
});

describe("PlayerSlimBar", () => {
  it("fires the play/pause action from the single button", () => {
    const paused = props(true);
    render(<PlayerSlimBar {...paused} />);
    fireEvent.click(screen.getByRole("button", { name: "Play / pause" }));
    expect(paused.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("renders the timeline with its time toggle", () => {
    const idle = props(false);
    render(<PlayerSlimBar {...idle} />);
    expect(screen.getByRole("button", { name: "Toggle elapsed / remaining time" })).toBeTruthy();
  });

  it("disables the button while no file is loaded", () => {
    render(<PlayerSlimBar {...props(true)} hasFile={false} />);
    const button = screen.getByRole("button", { name: "Play / pause" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
