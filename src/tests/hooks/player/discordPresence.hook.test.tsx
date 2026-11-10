import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerDiscordPresence } from "@/hooks/player/discordPresence.hook";
import { discordApi } from "@/api/discord.api";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { DiscordActivity } from "@/types/core/discord";
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
    expect(discordApi.clear).toHaveBeenCalledWith("player");
    expect(discordApi.set).toHaveBeenCalledTimes(1);
  });

  it("publishes the current card as soon as the setting is enabled", () => {
    settingsAtoms.parseTitlesPlayer.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    playbackAtoms.paused.set(true);
    renderHook(() => usePlayerDiscordPresence());
    expect(discordApi.set).not.toHaveBeenCalled();

    act(() => {
      settingsAtoms.discordRpcEnabled.set(true);
    });
    expect(discordApi.set).toHaveBeenCalledTimes(1);
    expect(vi.mocked(discordApi.set).mock.calls[0]?.[1]).toMatchObject({
      details: "Frieren",
      state: "discord.player.paused",
    });
  });

  it("pushes a pause immediately instead of leaving the old clock running", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    settingsAtoms.parseTitlesPlayer.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    playbackAtoms.duration.set(1440);
    playbackAtoms.timePos.set(25);
    playbackAtoms.paused.set(false);
    renderHook(() => usePlayerDiscordPresence());
    const playing = vi.mocked(discordApi.set).mock.calls[0]?.[1] as DiscordActivity | undefined;
    expect(playing?.startTimestamp).toBeTypeOf("number");

    act(() => {
      playbackAtoms.paused.set(true);
    });
    const paused = vi.mocked(discordApi.set).mock.calls.at(-1)?.[1] as DiscordActivity | undefined;
    expect(paused?.state).toBe("discord.player.paused");
    expect(paused?.startTimestamp).toBeUndefined();
    expect(paused?.endTimestamp).toBeUndefined();
  });

  it("re-anchors the clock after a seek", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    playbackAtoms.duration.set(1440);
    playbackAtoms.timePos.set(120);
    playbackAtoms.paused.set(false);
    renderHook(() => usePlayerDiscordPresence());
    const first = vi.mocked(discordApi.set).mock.calls[0]?.[1] as DiscordActivity | undefined;

    act(() => {
      playbackAtoms.timePos.set(600);
    });
    const seeked = vi.mocked(discordApi.set).mock.calls.at(-1)?.[1] as DiscordActivity | undefined;
    expect(discordApi.set).toHaveBeenCalledTimes(2);
    expect((first?.startTimestamp ?? 0) - (seeked?.startTimestamp ?? 0)).toBeGreaterThan(400_000);
  });

  it("does not resend the card for a small progress tick", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    playbackAtoms.path.set("C:/Anime/Frieren.mkv");
    playbackAtoms.hasFile.set(true);
    playbackAtoms.duration.set(1440);
    playbackAtoms.timePos.set(120);
    playbackAtoms.paused.set(false);
    renderHook(() => usePlayerDiscordPresence());

    act(() => {
      playbackAtoms.timePos.set(120.2);
    });
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
