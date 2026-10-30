import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerDiscordPresence } from "@/hooks/player/discordPresence.hook";
import { discordApi } from "@/api/discord.api";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import { PRESENCE_PROGRESS_INTERVAL_MS } from "@/lib/core/presence.utils";
import type { StreamOpen } from "@/types/player/videoPlayer";

vi.mock("@/api/discord.api", () => ({
  discordApi: {
    set: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    configure: vi.fn(async () => undefined),
  },
}));

const t = (key: string) => key;
vi.mock("@/hooks/i18n.hook", () => ({
  useI18n: () => ({ t }),
}));

const reset = (): void => {
  act(() => {
    settingsAtoms.discordRpcEnabled.set(false);
    settingsAtoms.parseTitlesPlayer.set(false);
    playbackAtoms.path.set("");
    playbackAtoms.hasFile.set(false);
    playbackAtoms.paused.set(false);
    playbackAtoms.eofReached.set(false);
    playbackAtoms.duration.set(0);
    playbackAtoms.timePos.set(0);
    streamSession.set(null);
  });
  vi.mocked(discordApi.set).mockClear();
  vi.mocked(discordApi.clear).mockClear();
  vi.mocked(discordApi.configure).mockClear();
};

beforeEach(() => {
  reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  reset();
});

const stream = (): StreamOpen => ({
  sourceId: "animelib",
  sourceName: "Animelib",
  mediaId: "1",
  mediaTitle: "Sousou no Frieren",
  episodeId: "10",
  episodeNumber: 12,
  episodeTitle: "",
  watchKey: "stream:animelib:1:10",
  headers: {},
  quality: "1080p",
  variantId: "variant",
  sources: [],
  mediaUrl: "https://example.test/media.m3u8",
  anilistId: 52991,
});

describe("usePlayerDiscordPresence", () => {
  it("sends nothing while the setting is disabled", () => {
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).not.toHaveBeenCalled();
    expect(discordApi.clear).not.toHaveBeenCalled();
  });

  it("clears the card when nothing is loaded", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.clear).toHaveBeenCalledWith("player");
    expect(discordApi.set).not.toHaveBeenCalled();
  });

  it("publishes the parsed local file", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    settingsAtoms.parseTitlesPlayer.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).toHaveBeenCalledWith("player", {
      details: "Frieren",
      activityType: 3,
      buttons: [
        { label: "discord.button.search", url: "https://anilist.co/search/anime?search=Frieren" },
      ],
    });
  });

  it("marks the card paused", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    settingsAtoms.parseTitlesPlayer.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    playbackAtoms.paused.set(true);
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).toHaveBeenCalledWith("player", {
      details: "Frieren",
      state: "discord.player.paused",
      activityType: 3,
      buttons: [
        { label: "discord.button.search", url: "https://anilist.co/search/anime?search=Frieren" },
      ],
    });
  });

  it("publishes the stream card", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    streamSession.set(stream());
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).toHaveBeenCalledWith("player", {
      details: "Sousou no Frieren",
      state: "player.title.episode",
      activityType: 3,
      buttons: [{ label: "discord.button.anilist", url: "https://anilist.co/anime/52991" }],
    });
  });

  it("does not re-send an identical activity on rerender", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    settingsAtoms.parseTitlesPlayer.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    const { rerender } = renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).toHaveBeenCalledTimes(1);
    rerender();
    expect(discordApi.set).toHaveBeenCalledTimes(1);
  });

  it("clears the card when the file is gone", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    settingsAtoms.parseTitlesPlayer.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).toHaveBeenCalledTimes(1);
    act(() => {
      playbackAtoms.hasFile.set(false);
    });
    act(() => {
      vi.advanceTimersByTime(PRESENCE_PROGRESS_INTERVAL_MS);
    });
    expect(discordApi.clear).toHaveBeenCalledWith("player");
    expect(discordApi.set).toHaveBeenCalledTimes(1);
  });

  it("clears the card on unmount", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    const { unmount } = renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).toHaveBeenCalledTimes(1);
    unmount();
    expect(discordApi.clear).toHaveBeenCalledWith("player");
  });
});
