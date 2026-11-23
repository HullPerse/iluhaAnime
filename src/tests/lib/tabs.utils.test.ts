import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  enabledTabPaths,
  firstEnabledTabPath,
  isEnabledTabPath,
  resolveSecretTabAction,
} from "@/lib/ui/tabs.utils";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({
    mainTabOrder: [],
    collectionTabEnabled: true,
    anilistTabEnabled: true,
    searchTabEnabled: true,
    torrentTabEnabled: true,
    playerTabEnabled: true,
    streamTabEnabled: true,
    mangaTabEnabled: false,
    newsTabEnabled: true,
    gameTabUnlocked: false,
  });
});

afterEach(() => {
  patchSettings({
    mainTabOrder: [],
    collectionTabEnabled: true,
    anilistTabEnabled: true,
    searchTabEnabled: true,
    torrentTabEnabled: true,
    playerTabEnabled: true,
    streamTabEnabled: true,
    mangaTabEnabled: false,
    newsTabEnabled: true,
    gameTabUnlocked: false,
  });
});

describe("tabs visibility", () => {
  it("uses saved order for navigation and keeps unmentioned tabs", () => {
    patchSettings({ mainTabOrder: ["settings", "anilist", "settings"] });
    expect(enabledTabPaths().slice(0, 3)).toEqual(["/settings", "/anilist", "/"]);
    expect(firstEnabledTabPath()).toBe("/settings");
    expect(enabledTabPaths().filter((path) => path === "/settings")).toHaveLength(1);
    patchSettings({ anilistTabEnabled: false });
    expect(enabledTabPaths()).not.toContain("/anilist");
    patchSettings({ anilistTabEnabled: true });
    expect(enabledTabPaths()[1]).toBe("/anilist");
  });
  it("lists every enabled tab path by default", () => {
    expect(enabledTabPaths()).toEqual([
      "/",
      "/torrent",
      "/player",
      "/anilist",
      "/stream",
      "/collection",
      "/news",
      "/settings",
    ]);
  });

  it("drops a tab disabled in settings", () => {
    patchSettings({ anilistTabEnabled: false });

    expect(enabledTabPaths()).not.toContain("/anilist");
    expect(isEnabledTabPath("/anilist")).toBe(false);
    expect(isEnabledTabPath("/player")).toBe(true);
  });

  it("exposes the manga route only when the manga tab is enabled", () => {
    expect(isEnabledTabPath("/manga")).toBe(false);
    patchSettings({ mangaTabEnabled: true });
    expect(isEnabledTabPath("/manga")).toBe(true);
  });

  it("treats unknown paths as enabled", () => {
    expect(isEnabledTabPath("/definitely-not-a-route")).toBe(true);
    expect(isEnabledTabPath("/player-window")).toBe(true);
  });

  it("keeps required tabs visible despite legacy disabled flags", () => {
    patchSettings({ searchTabEnabled: false, torrentTabEnabled: false });

    expect(firstEnabledTabPath()).toBe("/");
  });

  it("keeps settings as the always-visible tab", () => {
    patchSettings({
      collectionTabEnabled: false,
      anilistTabEnabled: false,
      searchTabEnabled: false,
      torrentTabEnabled: false,
      playerTabEnabled: false,
      streamTabEnabled: false,
      newsTabEnabled: false,
    });

    expect(enabledTabPaths()).toEqual(["/", "/torrent", "/player", "/settings"]);
    expect(firstEnabledTabPath()).toBe("/");
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
