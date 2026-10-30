import { afterEach, describe, expect, it } from "vitest";

import {
  enabledTabPaths,
  firstEnabledTabPath,
  isEnabledTabPath,
  resolveSecretTabAction,
  tabLabel,
} from "@/lib/ui/tabs.utils";
import { patchSettings } from "@/store/settings.store";

afterEach(() => {
  patchSettings({
    collectionTabEnabled: true,
    anilistTabEnabled: true,
    searchTabEnabled: true,
    torrentTabEnabled: true,
    playerTabEnabled: true,
    streamTabEnabled: true,
    gameTabUnlocked: false,
  });
});

describe("tabs visibility", () => {
  it("lists every enabled tab path by default", () => {
    expect(enabledTabPaths()).toEqual([
      "/",
      "/torrent",
      "/player",
      "/anilist",
      "/stream",
      "/collection",
      "/settings",
    ]);
  });

  it("drops a tab disabled in settings", () => {
    patchSettings({ torrentTabEnabled: false });

    expect(enabledTabPaths()).not.toContain("/torrent");
    expect(isEnabledTabPath("/torrent")).toBe(false);
    expect(isEnabledTabPath("/player")).toBe(true);
  });

  it("treats unknown paths as enabled", () => {
    expect(isEnabledTabPath("/definitely-not-a-route")).toBe(true);
    expect(isEnabledTabPath("/player-window")).toBe(true);
  });

  it("falls back through the visible order when early tabs are disabled", () => {
    patchSettings({ searchTabEnabled: false, torrentTabEnabled: false });

    expect(firstEnabledTabPath()).toBe("/player");
  });

  it("keeps settings as the always-visible tab", () => {
    patchSettings({
      collectionTabEnabled: false,
      anilistTabEnabled: false,
      searchTabEnabled: false,
      torrentTabEnabled: false,
      playerTabEnabled: false,
      streamTabEnabled: false,
    });

    expect(enabledTabPaths()).toEqual(["/settings"]);
    expect(firstEnabledTabPath()).toBe("/settings");
  });

  it("hides the game tab until the secret unlocks it", () => {
    expect(enabledTabPaths()).not.toContain("/game");
    expect(isEnabledTabPath("/game")).toBe(false);
  });

  it("shows the game tab after the secret unlocks it", () => {
    patchSettings({ gameTabUnlocked: true });

    expect(enabledTabPaths().at(-1)).toBe("/game");
    expect(isEnabledTabPath("/game")).toBe(true);
  });
});

describe("tab labels", () => {
  it("notes the Russian-only catalog on the stream tab in English", () => {
    expect(tabLabel("stream", "Streaming", "en", "[RUSSIAN ONLY]")).toBe(
      "Streaming [RUSSIAN ONLY]"
    );
  });

  it("keeps the plain label in Russian and on other tabs", () => {
    expect(tabLabel("stream", "Стриминг", "ru", "[ТОЛЬКО ПО-РУССКИ]")).toBe("Стриминг");
    expect(tabLabel("anilist", "AniList", "en", "[RUSSIAN ONLY]")).toBe("AniList");
  });
});

describe("secret tab toggle", () => {
  it("reveals the tab while it is locked", () => {
    expect(resolveSecretTabAction(false, false)).toBe("reveal");
    expect(resolveSecretTabAction(false, true)).toBe("reveal");
  });

  it("hides the tab from anywhere but itself", () => {
    expect(resolveSecretTabAction(true, false)).toBe("hide");
  });

  it("keeps an open tab in place", () => {
    expect(resolveSecretTabAction(true, true)).toBe("none");
  });
});
