import type { TranslationKey } from "@/lib/i18n";
import type { SettingsStore } from "@/types/settings";

export type TabId = "search" | "torrent" | "player" | "anilist" | "collection" | "settings";

export const TAB_KEYS: readonly { id: TabId; key: TranslationKey }[] = [
  { id: "search", key: "app.search" },
  { id: "torrent", key: "app.torrent" },
  { id: "player", key: "app.player" },
  { id: "anilist", key: "app.anilist" },
  { id: "collection", key: "app.collection" },
  { id: "settings", key: "app.settings" },
] as const;

type TabSettings = Pick<
  SettingsStore,
  | "collectionTabEnabled"
  | "anilistTabEnabled"
  | "searchTabEnabled"
  | "torrentTabEnabled"
  | "playerTabEnabled"
>;

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

// Alt+Digit shortcuts follow the visible tab strip position, so the number
// stays correct when tabs are toggled on or off in settings.
export function tabForAltDigit(settings: TabSettings, digit: number): TabId | undefined {
  if (!Number.isInteger(digit) || digit < 1) return undefined;
  return visibleTabs(settings)[digit - 1]?.id;
}
