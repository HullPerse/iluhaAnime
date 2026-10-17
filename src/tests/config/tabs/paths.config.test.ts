import { describe, expect, it } from "vitest";

import { TAB_PATHS, tabIdFromPath, tabPathFromId } from "@/config/tabs/paths.config";
import type { TabId } from "@/types/settings";

describe("tabs/paths", () => {
  it("maps every tab id to its path", () => {
    const ids = Object.keys(TAB_PATHS) as TabId[];

    expect(ids).toEqual([
      "search",
      "torrent",
      "player",
      "anilist",
      "collection",
      "settings",
      "game",
    ]);
    for (const id of ids) {
      expect(tabPathFromId(id)).toBe(TAB_PATHS[id]);
    }
  });

  it("resolves tab ids from paths", () => {
    expect(tabIdFromPath("/")).toBe("search");
    expect(tabIdFromPath("/torrent")).toBe("torrent");
    expect(tabIdFromPath("/settings")).toBe("settings");
    expect(tabIdFromPath("/game")).toBe("game");
  });

  it("returns undefined for unknown and window-only paths", () => {
    expect(tabIdFromPath("/definitely-not-a-route")).toBeUndefined();
    expect(tabIdFromPath("/player-window")).toBeUndefined();
  });
});
