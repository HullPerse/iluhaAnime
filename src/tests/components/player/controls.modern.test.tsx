import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModernControls from "@/routes/components/player/modern/controls.modern";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { MpvTrack } from "@/types/videoPlayer";

function subTrack(id: number): MpvTrack {
  return { id, type: "sub", lang: "rus", codec: "srt", selected: id === 1 };
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    paused: true,
    duration: 1421,
    chapters: [],
    tracks: [],
    hasPrev: false,
    hasNext: true,
    immersive: false,
    autoHide: true,
    volume: 0.5,
    muted: false,
    playlistOpen: false,
    seekTarget: null,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onSeekTo: vi.fn(),
    onScrub: vi.fn(),
    onCommitSeek: vi.fn(),
    onFilePrev: vi.fn(),
    onFileNext: vi.fn(),
    onFrameStep: vi.fn(),
    onCycleSub: vi.fn(),
    onVolume: vi.fn(),
    onMute: vi.fn(),
    onToggleAutoHide: vi.fn(),
    onTogglePlaylist: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  patchSettings({ language: "en" });
  playbackAtoms.timePos.set(754);
});

afterEach(() => {
  cleanup();
});

describe("ModernControls", () => {
  it("shows the current time against the total", () => {
    const { container } = render(<ModernControls {...props()} />);
    expect(container.textContent).toContain("12:34 / 23:41");
  });

  it("fires play and file navigation", () => {
    const owned = props();
    render(<ModernControls {...owned} />);
    const transport = screen.getAllByRole("button", { name: "Play / pause" });
    const play = transport.find((button) => !(button as HTMLButtonElement).disabled);
    if (!play) throw new Error("enabled play button not found");
    fireEvent.click(play);
    expect(owned.onPlay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    expect(owned.onFileNext).toHaveBeenCalledTimes(1);
  });

  it("disables the subtitle cycle without sub tracks and fires it with tracks", () => {
    const empty = render(<ModernControls {...props()} />);
    expect(
      (screen.getByRole("button", { name: "Subtitles" }) as HTMLButtonElement).disabled
    ).toBe(true);
    empty.unmount();
    const owned = props({ tracks: [subTrack(1)] });
    render(<ModernControls {...owned} />);
    const button = screen.getByRole("button", { name: "Subtitles" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(owned.onCycleSub).toHaveBeenCalledTimes(1);
  });

  it("steps frames and toggles the playlist", () => {
    const owned = props();
    const { container } = render(<ModernControls {...owned} />);
    const buttons = screen.getAllByRole("button");
    const frameBack = buttons.find((button) =>
      button.getAttribute("aria-label")?.includes("Previous frame")
    );
    if (!frameBack) throw new Error("frame back button not found");
    fireEvent.click(frameBack);
    expect(owned.onFrameStep).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Playlist" }));
    expect(owned.onTogglePlaylist).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("12:34 / 23:41");
  });
});
