import { describe, expect, it, vi } from "vitest";

import { buildModernPlayerMenu } from "@/routes/components/player/modern/menu.modern";
import type { ModernMenuActions, ModernMenuSnapshot, ModernMenuStream } from "@/types/menu.modern";
import type { StreamVariant } from "@/types/stream";
import type { MpvChapter, MpvTrack, StreamOpen } from "@/types/videoPlayer";

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
    viewMode: "normal",
    alwaysOnTop: false,
    speed: 1,
    eofMode: "next",
    playerMode: "normal",
    cabinet: "none",
    stream: null,
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
    onViewMode: vi.fn(),
    onToggleAlwaysOnTop: vi.fn(),
    onEofMode: vi.fn(),
    onPlayerMode: vi.fn(),
    onCabinet: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenCheatsheet: vi.fn(),
    onSelectVariant: vi.fn(),
    onSelectQuality: vi.fn(),
    onRetryVariants: vi.fn(),
    ...overrides,
  };
}

const VOICE: StreamVariant = {
  id: "1",
  name: "AniDUB",
  language: "Озвучка",
  separateStream: true,
  player: "Animelib",
  sourceUrl: "",
};

const OTHER_VOICE: StreamVariant = {
  id: "9",
  name: "Other",
  language: "Озвучка",
  separateStream: true,
  player: "Kodik",
  sourceUrl: "",
};

const SUBTITLE: StreamVariant = {
  id: "2",
  name: "Crunchyroll",
  language: "Субтитры",
  separateStream: true,
  player: "Kodik",
  sourceUrl: "",
};

function session(patch: Partial<StreamOpen> = {}): StreamOpen {
  return {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: "1",
    mediaTitle: "Frieren",
    episodeId: "10",
    episodeNumber: 1,
    episodeTitle: "The journey",
    watchKey: "stream:animelib:1:10",
    headers: {},
    quality: "1080p",
    variantId: "Animelib:1",
    sources: [
      { url: "https://cdn/1080.mp4", type: "mp4", quality: "1080", label: "1080p" },
      { url: "https://cdn/720.mp4", type: "mp4", quality: "720", label: "720p" },
    ],
    mediaUrl: "https://cdn/1080.mp4",
    ...patch,
  };
}

function streamMenu(patch: Partial<ModernMenuStream> = {}): ModernMenuStream {
  return {
    session: session(),
    variants: [VOICE, OTHER_VOICE, SUBTITLE],
    variantsLoading: false,
    variantsFailed: false,
    switching: false,
    ...patch,
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
        if (
          entry.id === "toggle-playlist" ||
          entry.id === "view-mode" ||
          entry.id === "screen-mode" ||
          entry.id === "screen-cabinet" ||
          entry.id === "toggle-always-on-top" ||
          entry.id.startsWith("open-")
        ) {
          continue;
        }
        expect(entry.disabled).toBe(true);
      }
    }
  });

  it("marks the current view preset and wires the switch", () => {
    const onViewMode = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ viewMode: "compact" }),
      actions({ onViewMode })
    );
    const view = entries.find((entry) => entry.id === "view-mode");
    if (view?.kind !== "submenu") throw new Error("missing view submenu");
    expect(view.entries).toHaveLength(3);
    const active = view.entries.find(
      (entry) => entry.kind === "item" && entry.id === "view-compact"
    );
    if (active?.kind !== "item") throw new Error("missing compact entry");
    expect(active.checked).toBe(true);
    active.onSelect();
    expect(onViewMode).toHaveBeenCalledWith("compact");
  });

  it("marks the player mode and cabinet, and wires both", () => {
    const onPlayerMode = vi.fn();
    const onCabinet = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ playerMode: "tv", cabinet: "wood" }),
      actions({ onPlayerMode, onCabinet })
    );

    const mode = entries.find((entry) => entry.id === "screen-mode");
    if (mode?.kind !== "submenu") throw new Error("missing player mode submenu");
    expect(mode.entries).toHaveLength(5);
    const television = mode.entries.find(
      (entry) => entry.kind === "item" && entry.id === "screen-mode-tv"
    );
    if (television?.kind !== "item") throw new Error("missing television entry");
    expect(television.checked).toBe(true);
    television.onSelect();
    expect(onPlayerMode).toHaveBeenCalledWith("tv");

    const cabinet = entries.find((entry) => entry.id === "screen-cabinet");
    if (cabinet?.kind !== "submenu") throw new Error("missing cabinet submenu");
    expect(cabinet.entries).toHaveLength(3);
    const wood = cabinet.entries.find(
      (entry) => entry.kind === "item" && entry.id === "screen-cabinet-wood"
    );
    if (wood?.kind !== "item") throw new Error("missing wood entry");
    expect(wood.checked).toBe(true);
    wood.onSelect();
    expect(onCabinet).toHaveBeenCalledWith("wood");
  });

  it("marks always on top and wires the toggle", () => {
    const onToggleAlwaysOnTop = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ alwaysOnTop: true }),
      actions({ onToggleAlwaysOnTop })
    );
    const pin = entries.find((entry) => entry.id === "toggle-always-on-top");
    if (pin?.kind !== "item") throw new Error("missing always on top item");
    expect(pin.checked).toBe(true);
    pin.onSelect();
    expect(onToggleAlwaysOnTop).toHaveBeenCalledTimes(1);
  });

  it("marks the current speed and playlist state", () => {
    const onSpeed = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ speed: 1.5, playlistOpen: true }),
      actions({ onSpeed })
    );
    const speed = entries[4];
    if (speed.kind !== "submenu") throw new Error("speed must be a submenu");
    const active = speed.entries.find((entry) => entry.kind === "item" && entry.rawText === "1.5x");
    if (active?.kind !== "item") throw new Error("missing 1.5x entry");
    expect(active.checked).toBe(true);
    active.onSelect();
    expect(onSpeed).toHaveBeenCalledWith(1.5);
    const playlist = entries.find((entry) => entry.id === "toggle-playlist");
    if (playlist?.kind !== "item") throw new Error("missing playlist toggle");
    expect(playlist.checked).toBe(true);
  });

  it("renders chapters with timestamps or a disabled placeholder", () => {
    const chapters: MpvChapter[] = [{ title: "Intro", time: 90 }];
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
    const entries = buildModernPlayerMenu(snapshot({ eofMode: "repeat" }), actions({ onEofMode }));
    const eof = entries.find((entry) => entry.id === "eof-mode");
    if (eof?.kind !== "submenu") throw new Error("missing eof submenu");
    expect(eof.entries).toHaveLength(4);
    const active = eof.entries.find((entry) => entry.kind === "item" && entry.id === "eof-repeat");
    if (active?.kind !== "item") throw new Error("missing repeat entry");
    expect(active.checked).toBe(true);
    active.onSelect();
    expect(onEofMode).toHaveBeenCalledWith("repeat");
  });

  it("replaces the mpv track lists with the stream choices", () => {
    const entries = buildModernPlayerMenu(snapshot({ stream: streamMenu() }), actions());
    const ids = entries.map((entry) => entry.id);
    expect(ids.slice(1, 4)).toEqual(["stream-voice", "stream-subs", "stream-quality"]);
    expect(ids).not.toContain("subtitles");
    expect(ids).not.toContain("audio");
  });

  it("marks the playing voice-over and the resolved quality, and wires both", () => {
    const onSelectVariant = vi.fn();
    const onSelectQuality = vi.fn();
    const entries = buildModernPlayerMenu(
      snapshot({ stream: streamMenu() }),
      actions({ onSelectVariant, onSelectQuality })
    );

    const voice = entries.find((entry) => entry.id === "stream-voice");
    if (voice?.kind !== "submenu") throw new Error("missing voice submenu");
    const voices = voice.entries.filter((entry) => entry.kind === "item");
    expect(voices.map((entry) => entry.rawText)).toEqual(["AniDUB", "Other"]);
    const [current, other] = voices;
    if (current.kind !== "item" || other.kind !== "item") throw new Error("expected items");
    expect(current.checked).toBe(true);
    expect(other.checked).toBe(false);
    other.onSelect();
    expect(onSelectVariant).toHaveBeenCalledWith(OTHER_VOICE);

    const quality = entries.find((entry) => entry.id === "stream-quality");
    if (quality?.kind !== "submenu") throw new Error("missing quality submenu");
    const [best, lower] = quality.entries;
    if (best.kind !== "item" || lower.kind !== "item") throw new Error("expected quality items");
    expect(best.rawText).toBe("1080p");
    expect(best.checked).toBe(true);
    lower.onSelect();
    expect(onSelectQuality).toHaveBeenCalledWith("720p");
  });

  it("keeps a subtitle stream in its own list", () => {
    const entries = buildModernPlayerMenu(
      snapshot({ stream: streamMenu({ session: session({ variantId: "Kodik:2" }) }) }),
      actions()
    );

    const subs = entries.find((entry) => entry.id === "stream-subs");
    if (subs?.kind !== "submenu") throw new Error("missing subtitle submenu");
    const subtitleItems = subs.entries.filter((entry) => entry.kind === "item");
    expect(subtitleItems).toHaveLength(1);
    const only = subtitleItems[0];
    if (only.kind !== "item") throw new Error("expected item");
    expect(only.checked).toBe(true);

    const voice = entries.find((entry) => entry.id === "stream-voice");
    if (voice?.kind !== "submenu") throw new Error("missing voice submenu");
    const voiceItems = voice.entries.filter((entry) => entry.kind === "item");
    expect(voiceItems.some((entry) => entry.kind === "item" && entry.checked === true)).toBe(false);
  });

  it("shows the list states and retries a failed one", () => {
    const loading = buildModernPlayerMenu(
      snapshot({ stream: streamMenu({ variantsLoading: true }) }),
      actions()
    );
    const waiting = loading.find((entry) => entry.id === "stream-voice");
    if (waiting?.kind !== "submenu") throw new Error("missing voice submenu");
    expect(waiting.entries).toHaveLength(1);
    const status = waiting.entries[0];
    if (status.kind !== "item") throw new Error("expected status item");
    expect(status.label).toBe("player.stream.menu.loading");
    expect(status.disabled).toBe(true);

    const onRetryVariants = vi.fn();
    const failed = buildModernPlayerMenu(
      snapshot({ stream: streamMenu({ variantsFailed: true }) }),
      actions({ onRetryVariants })
    );
    const failedVoice = failed.find((entry) => entry.id === "stream-voice");
    if (failedVoice?.kind !== "submenu") throw new Error("missing voice submenu");
    const retry = failedVoice.entries[1];
    if (retry.kind !== "item") throw new Error("expected retry item");
    expect(retry.label).toBe("player.stream.retry");
    retry.onSelect();
    expect(onRetryVariants).toHaveBeenCalledTimes(1);
  });

  it("disables the stream choices while a switch runs", () => {
    const entries = buildModernPlayerMenu(
      snapshot({ stream: streamMenu({ switching: true }) }),
      actions()
    );
    for (const id of ["stream-voice", "stream-subs", "stream-quality"]) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (entry?.kind !== "submenu") throw new Error(`missing ${id}`);
      expect(entry.disabled).toBe(true);
    }
  });
});
