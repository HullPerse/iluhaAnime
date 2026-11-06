import { keysOf } from "@/lib/core/hotkeys/keysOf.utils";
import type { TabId } from "@/types/ui/settings";
import type { TabPath } from "@/types/ui/tabPaths";

export const TAB_PATHS: Record<TabId, TabPath> = {
  search: "/",
  torrent: "/torrent",
  player: "/player",
  anilist: "/anilist",
  collection: "/collection",
  settings: "/settings",
  game: "/game",
  stream: "/stream",
};

export function tabPathFromId(tab: TabId): TabPath {
  return TAB_PATHS[tab];
}

export function tabIdFromPath(pathname: string): TabId | undefined {
  return keysOf(TAB_PATHS).find((tab) => TAB_PATHS[tab] === pathname);
}
