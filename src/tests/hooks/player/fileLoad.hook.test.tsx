import { mediaEntries, setMediaTrack } from "@/store/media.store";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerFileLoad } from "@/hooks/player/fileLoad.hook";
import {
  DEFAULT_PLAYER_SETTINGS,
  patchPlayerSettings,
  playbackAtoms,
  streamSession,
} from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import { mockInvoke } from "@/tests/mocks";
import type { HwdecReload } from "@/types/player/resume";

let path = "/marathon/01.mkv";

beforeEach(() => {
  path = "/marathon/01.mkv";
  streamSession.set(null);
  mediaEntries.set([]);
  patchPlayerSettings({ ...DEFAULT_PLAYER_SETTINGS });
  patchSettings({ autoLoadSidecarTracks: false });
  mockInvoke.mockImplementation(async (command: string, args?: { name?: string }) => {
    if (command === "player_get_property" && args?.name === "path") return path;

    if (command === "player_load_watch") return null;

    return undefined;
  });
});

const pauseWrites = () =>
  mockInvoke.mock.calls
    .filter(([command, args]) => command === "player_set_property" && args?.name === "pause")
    .map(([, args]) => args?.value);

function mount() {
  const hwdecReloadRef: { current: HwdecReload | null } = { current: null };
  const deps = {
    stream: null,
    streamRoute: { markPlaying: vi.fn(), failNow: vi.fn(), retryNow: vi.fn() },
    syncMarginsRef: { current: vi.fn() },
    resumeRef: { current: undefined },
    initialWatchRef: { current: undefined },
    hwdecReloadRef,
    loadEpochRef: { current: 0 },
    setFinished: vi.fn(),
    setLoadingFile: vi.fn(),
    setFailed: vi.fn(),
    setFileReady: vi.fn(),
  };

  return { ...renderHook(() => usePlayerFileLoad(deps)), hwdecReloadRef };
}

describe("local episode transitions", () => {
  it.each([true, false])(
    "keeps first open paused and applies pauseNextEpisode=%s on the next file",
    async (paused) => {
      patchPlayerSettings({ pauseNextEpisode: paused });
      const { result } = mount();
      await act(async () => {
        await result.current.handleFileLoaded();
      });
      expect(pauseWrites().at(-1)).toBe(true);
      mockInvoke.mockClear();
      path = "/marathon/02.mkv";
      await act(async () => {
        await result.current.handleFileLoaded();
      });
      expect(pauseWrites().at(-1)).toBe(paused);
    }
  );

  it("preserves a paused decoder reload even when continuous playback is enabled", async () => {
    patchPlayerSettings({ pauseNextEpisode: false });
    const { result, hwdecReloadRef } = mount();
    await act(async () => {
      await result.current.handleFileLoaded();
    });
    hwdecReloadRef.current = { position: 0, paused: true };
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.handleFileLoaded();
    });
    expect(pauseWrites().at(-1)).toBe(true);
  });
});

describe("local language preferences", () => {
  it("applies preferences to consecutive files using their current track IDs", async () => {
    patchPlayerSettings({ audioLanguage: "ja", subtitleLanguage: "ru" });
    const { result } = mount();

    for (const id of [3, 7]) {
      path = `/language/${id}.mkv`;
      playbackAtoms.tracks.set([
        { id, type: "audio", lang: "jpn" },
        { id: id + 1, type: "sub", lang: "rus" },
      ]);
      await act(async () => {
        await result.current.handleFileLoaded();
      });
      expect(mockInvoke).toHaveBeenCalledWith("player_apply_file_tracks", {
        audioTrack: id,
        subtitleTrack: id + 1,
        expectedPath: path,
      });
    }
  });
});

it("keeps saved identities and subtitles off ahead of language defaults", async () => {
  path = "/saved/languages.mkv";
  patchPlayerSettings({ audioLanguage: "ja", subtitleLanguage: "ru" });
  setMediaTrack(path, "audio", 1, "audio:eng");
  setMediaTrack(path, "sub", "no");
  playbackAtoms.tracks.set([
    { id: 4, type: "audio", lang: "eng" },
    { id: 5, type: "audio", lang: "jpn" },
    { id: 6, type: "sub", lang: "rus" },
  ]);
  const { result } = mount();
  await act(async () => {
    await result.current.handleFileLoaded();
  });
  expect(mockInvoke).toHaveBeenCalledWith("player_apply_file_tracks", {
    audioTrack: 4,
    subtitleTrack: "no",
    expectedPath: path,
  });
});
it("does not override mpv when requested languages are unavailable", async () => {
  patchPlayerSettings({ audioLanguage: "de", subtitleLanguage: "ru" });
  playbackAtoms.tracks.set([
    { id: 1, type: "audio", lang: "eng" },
    { id: 2, type: "sub" },
  ]);
  const { result } = mount();
  await act(async () => {
    await result.current.handleFileLoaded();
  });
  expect(
    mockInvoke.mock.calls.filter(([command]) => command === "player_apply_file_tracks")
  ).toEqual([]);
});

it("applies a sidecar language only after sidecar loading completes", async () => {
  patchSettings({ autoLoadSidecarTracks: true });
  patchPlayerSettings({ subtitleLanguage: "ru" });
  playbackAtoms.tracks.set([]);
  mockInvoke.mockImplementation(async (command: string, args?: { name?: string }) => {
    if (command === "player_get_property" && args?.name === "path") return path;

    if (command === "player_load_watch") return null;

    if (command === "scan_sidecar_tracks")
      return [{ path: "/marathon/01.ru.srt", name: "01.ru.srt", kind: "sub" }];

    if (command === "player_command")
      playbackAtoms.tracks.set([
        {
          id: 17,
          type: "sub",
          lang: "rus",
          external: true,
          "external-filename": "/marathon/01.ru.srt",
        },
      ]);

    return undefined;
  });
  const { result } = mount();
  await act(async () => {
    await result.current.handleFileLoaded();
  });
  expect(mockInvoke).toHaveBeenCalledWith("player_apply_file_tracks", {
    audioTrack: null,
    subtitleTrack: 17,
    expectedPath: path,
  });
  const calls = mockInvoke.mock.calls.map(([command]) => command);
  expect(calls.indexOf("player_command")).toBeLessThan(calls.indexOf("player_apply_file_tracks"));
});
