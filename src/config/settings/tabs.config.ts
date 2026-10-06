import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { SettingsTab, TabId, TabSettings } from "@/types/settings";

const TAB_KEYS: readonly { id: TabId; key: TranslationKey }[] = [
  { id: "search", key: "app.search" },
  { id: "torrent", key: "app.torrent" },
  { id: "player", key: "app.player" },
  { id: "anilist", key: "app.anilist" },
  { id: "collection", key: "app.collection" },
  { id: "settings", key: "app.settings" },
] as const;

function isEnabled(id: TabId, s: TabSettings): boolean {
  if (id === "collection") return s.collectionTabEnabled;
  if (id === "anilist") return s.anilistTabEnabled;
  if (id === "search") return s.searchTabEnabled;
  if (id === "torrent") return s.torrentTabEnabled;
  if (id === "player") return s.playerTabEnabled;
  return true;
}

export function visibleTabs(settings: TabSettings) {
  return TAB_KEYS.filter((tab) => isEnabled(tab.id, settings));
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
  { id: "changelog", key: "settings.changelog" },
] as const;

export const SETTINGS_TABS = new Set<SettingsTab>([
  "general",
  "notifications",
  "search",
  "torrent",
  "theme",
  "sqlite",
  "changelog",
]);
