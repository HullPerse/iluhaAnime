import { describe, expect, it, vi } from "vitest";

import type { MpvChapter, MpvTrack } from "@/types/videoPlayer";

import {
  buildModernPlayerMenu,
  type ModernMenuActions,
  type ModernMenuSnapshot,
} from "@/routes/components/player/modern/menu.modern";

function track(id: number, type: MpvTrack["type"], selected = false): MpvTrack {
  return { id, type, lang: "rus", codec: "srt", selected };
}

function snapshot(overrides: Partial<ModernMenuSnapshot> = {}): ModernMenuSnapshot {
  return {
    hasFile: true,
    paused: true,
    tracks: [],
    chapters: [],
    playlistOpen: false,
    fullscreen: false,
    speed: 1,
    eofMode: "next",
    ...overrides,
  };
}

function actions(overrides: Partial<ModernMenuActions> = {}): ModernMenuActions {
  return {
    onPlayPause: vi.fn(),
    onFrameStep: vi.fn(),
    onPrevFile: vi.fn(),
    onNextFile: vi.fn(),
    onSelectAudio: vi.fn(),
    onSelectSub: vi.fn(),
    onSeekTo: vi.fn(),
    onSpeed: vi.fn(),
    onTogglePlaylist: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onEofMode: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenCheatsheet: vi.fn(),
    ...overrides,
  };
}

describe("buildModernPlayerMenu", () => {
  it("shows play when paused and pause when playing", () => {
    const paused = buildModernPlayerMenu(snapshot({ paused: true }), actions());
    const playing = buildModernPlayerMenu(snapshot({ paused: false }), actions());
    const toggleOf = (entries: ReturnType<typeof buildModernPlayerMenu>) => {
      const submenu = entries[0];
      if (submenu.kind !== "submenu") throw new Error("playback must be a submenu");
      const toggle = submenu.entries[0];
      if (toggle.kind !== "item") throw new Error("first playback entry must be an item");
      return toggle.label;
    };
    expect(toggleOf(paused)).toBe("player.media.menu.play");
    expect(toggleOf(playing)).toBe("player.media.menu.pause");
  });

  it("shows only a disabled off entry when no subtitle tracks exist", () => {
    const entries = buildModernPlayerMenu(snapshot({ tracks: [] }), actions());
    const subs = entries[1];
    if (subs.kind !== "submenu") throw new Error("subtitles must be a submenu");
    expect(subs.entries).toHaveLength(1);
    const off = subs.entries[0];
    if (off.kind !== "item") throw new Error("empty subs must hold one item");
    expect(off.disabled).toBe(true);
  });

  it("marks the selected track and wires select callbacks", () => {
    const onSelectSub = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ tracks: [track(1, "sub", true), track(2, "sub")] }),
      actions({ onSelectSub })
    );
    const subs = entries[1];
    if (subs.kind !== "submenu") throw new Error("subtitles must be a submenu");
    const items = subs.entries.filter((entry) => entry.kind === "item");
    expect(items).toHaveLength(3);
    const off = items[0];
    const first = items[1];
    if (off.kind !== "item" || first.kind !== "item") throw new Error("expected items");
    expect(off.checked).toBe(false);
    expect(first.checked).toBe(true);
    expect(first.rawText).toContain("SRT");
    first.onSelect();
    expect(onSelectSub).toHaveBeenCalledWith(1);
    off.onSelect();
    expect(onSelectSub).toHaveBeenCalledWith("no");
  });

  it("disables the whole menu without a file", () => {
    const entries = buildModernPlayerMenu(snapshot({ hasFile: false }), actions());
    for (const entry of entries) {
      if (entry.kind === "submenu" || entry.kind === "item") {
        if (entry.id === "toggle-playlist" || entry.id.startsWith("open-")) continue;
        expect(entry.disabled).toBe(true);
      }
    }
  });

  it("marks the current speed and playlist state", () => {
    const onSpeed = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ speed: 1.5, playlistOpen: true }),
      actions({ onSpeed })
    );
    const speed = entries[4];
    if (speed.kind !== "submenu") throw new Error("speed must be a submenu");
    const active = speed.entries.find(
      (entry) => entry.kind === "item" && entry.rawText === "1.5x"
    );
    if (active?.kind !== "item") throw new Error("missing 1.5x entry");
    expect(active.checked).toBe(true);
    active.onSelect();
    expect(onSpeed).toHaveBeenCalledWith(1.5);
    const playlist = entries.find((entry) => entry.id === "toggle-playlist");
    if (playlist?.kind !== "item") throw new Error("missing playlist toggle");
    expect(playlist.checked).toBe(true);
  });

  it("renders chapters with timestamps or a disabled placeholder", () => {    const chapters: MpvChapter[] = [{ title: "Intro", time: 90 }];
    const onSeekTo = vi.fn();
    const filled = buildModernPlayerMenu(snapshot({ chapters }), actions({ onSeekTo }));
    const menu = filled[3];
    if (menu.kind !== "submenu") throw new Error("chapters must be a submenu");
    const first = menu.entries[0];
    if (first.kind !== "item") throw new Error("chapter must be an item");
    expect(first.rawText).toBe("Intro - 1:30");
    first.onSelect();
    expect(onSeekTo).toHaveBeenCalledWith(90);

    const empty = buildModernPlayerMenu(snapshot({ chapters: [] }), actions());
    const emptyMenu = empty[3];
    if (emptyMenu.kind !== "submenu") throw new Error("chapters must be a submenu");
    const placeholder = emptyMenu.entries[0];
    if (placeholder.kind !== "item") throw new Error("empty chapters must hold one item");
    expect(placeholder.disabled).toBe(true);
  });

  it("marks the end-of-file mode and wires the switch", () => {
    const onEofMode = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ eofMode: "repeat" }),
      actions({ onEofMode })
    );
    const eof = entries.find((entry) => entry.id === "eof-mode");
    if (eof?.kind !== "submenu") throw new Error("missing eof submenu");
    expect(eof.entries).toHaveLength(4);
    const active = eof.entries.find(
      (entry) => entry.kind === "item" && entry.id === "eof-repeat"
    );
    if (active?.kind !== "item") throw new Error("missing repeat entry");
    expect(active.checked).toBe(true);
    active.onSelect();
    expect(onEofMode).toHaveBeenCalledWith("repeat");
  });
});
