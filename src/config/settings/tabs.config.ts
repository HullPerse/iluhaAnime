import * as z from "zod/mini";

import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { withFallback } from "@/lib/core/schema.utils";
import type { SettingsTab, TabId, TabSettings } from "@/types/ui/settings";

export const TAB_KEYS: readonly { id: TabId; key: TranslationKey }[] = [
  { id: "search", key: "app.search" },
  { id: "torrent", key: "app.torrent" },
  { id: "player", key: "app.player" },
  { id: "anilist", key: "app.anilist" },
  { id: "stream", key: "app.stream" },
  { id: "collection", key: "app.collection" },
  { id: "settings", key: "app.settings" },
] as const;

const TAB_FLAGS: Partial<Record<TabId, keyof TabSettings>> = {
  anilist: "anilistTabEnabled",
  collection: "collectionTabEnabled",
  player: "playerTabEnabled",
  search: "searchTabEnabled",
  stream: "streamTabEnabled",
  torrent: "torrentTabEnabled",
};

function isEnabled(id: TabId, s: TabSettings): boolean {
  const flag = TAB_FLAGS[id];
  return flag ? s[flag] : true;
}

const GAME_TAB_KEY: { id: TabId; key: TranslationKey } = { id: "game", key: "app.game" };

export function visibleTabs(settings: TabSettings) {
  const tabs = TAB_KEYS.filter((tab) => isEnabled(tab.id, settings));
  return settings.gameTabUnlocked ? [...tabs, GAME_TAB_KEY] : tabs;
}

export function tabForAltDigit(settings: TabSettings, digit: number): TabId | undefined {
  if (!Number.isInteger(digit) || digit < 1) return undefined;
  return visibleTabs(settings)[digit - 1]?.id;
}

export const SETTINGS_TAB_KEYS: readonly { id: SettingsTab; key: TranslationKey }[] = [
  { id: "general", key: "settings.general" },
  { id: "notifications", key: "settings.notifications" },
  { id: "search", key: "settings.search" },
  { id: "torrent", key: "settings.torrent" },
  { id: "theme", key: "settings.theme" },
  { id: "keybinds", key: "settings.keybinds" },
  { id: "changelog", key: "settings.changelog" },
] as const;

export const SETTINGS_TABS = new Set<SettingsTab>([
  "general",
  "notifications",
  "search",
  "torrent",
  "theme",
  "sqlite",
  "keybinds",
  "changelog",
]);

export const settingsSearchSchema = z.object({
  tab: withFallback(z.enum([...SETTINGS_TABS]), "general"),
});

export type SettingsSearch = z.infer<typeof settingsSearchSchema>;
