import * as z from "zod/mini";

import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { withFallback } from "@/lib/core/persistence/schema.utils";
import type { SettingsTab, SettingsTabGroup, TabId, TabSettings } from "@/types/ui/settings";

export const TAB_KEYS: readonly { id: TabId; key: TranslationKey }[] = [
  { id: "search", key: "app.search" },
  { id: "torrent", key: "app.torrent" },
  { id: "player", key: "app.player" },
  { id: "anilist", key: "app.anilist" },
  { id: "stream", key: "app.stream" },
  { id: "collection", key: "app.collection" },
  { id: "news", key: "app.news" },
  { id: "settings", key: "app.settings" },
] as const;

const TAB_FLAGS: Partial<Record<TabId, keyof TabSettings>> = {
  anilist: "anilistTabEnabled",
  collection: "collectionTabEnabled",
  news: "newsTabEnabled",
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

export const SETTINGS_TAB_KEYS: readonly { id: SettingsTab; key: TranslationKey }[] = [
  { id: "general", key: "settings.general" },
  { id: "notifications", key: "settings.notifications" },
  { id: "search", key: "settings.search" },
  { id: "torrent", key: "settings.torrent" },
  { id: "proxy", key: "settings.proxy" },
  { id: "theme", key: "settings.theme" },
  { id: "keybinds", key: "settings.keybinds" },
  { id: "changelog", key: "settings.changelog" },
  { id: "sqlite", key: "settings.sqlite" },
] as const;

export const SETTINGS_TAB_GROUPS: readonly SettingsTabGroup[] = [
  {
    id: "main",
    titleKey: "settings.group.main",
    tabs: ["general", "theme", "notifications", "keybinds"],
  },
  { id: "data", titleKey: "settings.group.data", tabs: ["search", "torrent"] },
  { id: "integrations", titleKey: "settings.group.integrations", tabs: ["proxy"] },
  { id: "advanced", titleKey: "settings.group.advanced", tabs: ["sqlite", "changelog"] },
];

const SETTINGS_TABS = new Set<SettingsTab>([
  "general",
  "notifications",
  "search",
  "torrent",
  "proxy",
  "theme",
  "sqlite",
  "keybinds",
  "changelog",
]);

export const settingsSearchSchema = z.object({
  tab: withFallback(z.enum([...SETTINGS_TABS]), "general"),
});
