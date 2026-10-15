import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerBottomBar from "@/routes/components/player/modern/bottom.modern";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

function props(playerType: "default" | "modern") {
  return {
    playerType,
    paused: true,
    duration: 1421,
    chapters: [],
    tracks: [],
    hasPrev: false,
    hasNext: true,
    immersive: false,
    autoHide: true,
    speed: 1,
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
    onSpeed: vi.fn(),
    onVolume: vi.fn(),
    onMute: vi.fn(),
    onToggleAutoHide: vi.fn(),
    onTogglePlaylist: vi.fn(),
    onSelectAudio: vi.fn(),
    onSelectSub: vi.fn(),
    onAddAudio: vi.fn(),
    onAddSubtitle: vi.fn(),
    hideTracks: false,
  };
}

beforeEach(() => {
  patchSettings({ language: "en" });
  playbackAtoms.timePos.set(754);
});

afterEach(() => {
  cleanup();
});

describe("PlayerBottomBar", () => {
  it("renders frame controls in modern mode only", () => {
    const modern = render(<PlayerBottomBar {...props("modern")} />);
    expect(screen.getByRole("button", { name: "Previous frame" })).toBeTruthy();
    modern.unmount();
    render(<PlayerBottomBar {...props("default")} />);
    expect(screen.queryByRole("button", { name: "Previous frame" })).toBeNull();
  });

  it("hides the default track selects when asked", () => {
    const audio = { id: 1, type: "audio", lang: "rus", codec: "aac" } as const;
    const shown = render(<PlayerBottomBar {...props("default")} hideTracks={false} tracks={[audio]} />);
    expect(screen.getByRole("button", { name: "Audio:" })).toBeTruthy();
    shown.unmount();
    render(<PlayerBottomBar {...props("default")} hideTracks tracks={[audio]} />);
    expect(screen.queryByRole("button", { name: "Audio:" })).toBeNull();
  });
});
