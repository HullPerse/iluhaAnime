import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDiscordPresence } from "@/hooks/discordPresence.hook";
import { discordApi } from "@/api/discord.api";
import { settingsAtoms } from "@/store/settings.store";
import { presenceAtoms } from "@/store/presence.store";
import type { TabId } from "@/types/ui/settings";

vi.mock("@/api/discord.api", () => ({
  discordApi: {
    set: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    configure: vi.fn(async () => undefined),
  },
}));
vi.mock("@/routes/components/anilist/user/data.user", () => ({
  useUserAnilistData: vi.fn(() => ({ user: null })),
}));
vi.mock("@/hooks/i18n.hook", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const reset = (): void => {
  act(() => {
    settingsAtoms.discordRpcEnabled.set(false);
    presenceAtoms.detail.set(null);
    presenceAtoms.search.set(false);
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
  cleanup();
  vi.useRealTimers();
  reset();
});

describe("useDiscordPresence", () => {
  it("keeps the card off while the setting is disabled", () => {
    renderHook(() => useDiscordPresence("collection" as TabId));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(discordApi.configure).toHaveBeenCalledWith(false);
    expect(discordApi.set).not.toHaveBeenCalled();
    expect(discordApi.clear).not.toHaveBeenCalled();
  });

  it("publishes the idle card once enabled", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    renderHook(() => useDiscordPresence("collection" as TabId));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(discordApi.set).toHaveBeenCalledWith("main", {
      details: "discord.idle.running",
    });
    expect(discordApi.clear).not.toHaveBeenCalled();
  });

  it("publishes the open AniList detail instead of idle", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    presenceAtoms.detail.set({ id: 52991, title: "Sousou no Frieren" });
    renderHook(() => useDiscordPresence("collection" as TabId));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(discordApi.set).toHaveBeenCalledWith("main", {
      details: "Sousou no Frieren",
      state: "discord.detail.state",
      buttons: [{ label: "discord.button.anilist", url: "https://anilist.co/anime/52991" }],
    });
  });

  it("falls back to idle when the detail closes", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    presenceAtoms.detail.set({ id: 1, title: "Sousou no Frieren" });
    renderHook(() => useDiscordPresence("collection" as TabId));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(discordApi.set).toHaveBeenLastCalledWith("main", {
      details: "Sousou no Frieren",
      state: "discord.detail.state",
      buttons: [{ label: "discord.button.anilist", url: "https://anilist.co/anime/1" }],
    });
    act(() => {
      presenceAtoms.detail.set(null);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(discordApi.set).toHaveBeenLastCalledWith("main", {
      details: "discord.idle.running",
    });
  });

  it("publishes the search card on the Search tab", () => {
    settingsAtoms.discordRpcEnabled.set(true);
    presenceAtoms.search.set(true);
    renderHook(() => useDiscordPresence("search" as TabId));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(discordApi.set).toHaveBeenCalledWith("main", {
      details: "discord.search.details",
    });
  });
});
