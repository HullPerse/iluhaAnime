import { visibleTabs } from "@/config/tabs.config";
import { TAB_PATHS, tabIdFromPath, type TabPath } from "@/config/tabPaths.config";
import { settingsAtoms } from "@/store/settings.store";
import type { TabId, TabSettings } from "@/types/settings";

function tabSettingsSnapshot(): TabSettings {
  return {
    collectionTabEnabled: settingsAtoms.collectionTabEnabled.get(),
    anilistTabEnabled: settingsAtoms.anilistTabEnabled.get(),
    searchTabEnabled: settingsAtoms.searchTabEnabled.get(),
    torrentTabEnabled: settingsAtoms.torrentTabEnabled.get(),
    playerTabEnabled: settingsAtoms.playerTabEnabled.get(),
    streamTabEnabled: settingsAtoms.streamTabEnabled.get(),
    gameTabUnlocked: settingsAtoms.gameTabUnlocked.get(),
  };
}

/**
 * The tab label with the note an English UI needs: the streaming catalog is
 * Russian only, so the tab says it rather than letting the catalog look broken.
 */
export function tabLabel(
  id: TabId,
  label: string,
  language: "en" | "ru",
  russianOnlyNote: string
): string {
  return id === "stream" && language === "en" ? `${label} ${russianOnlyNote}` : label;
}

export function enabledTabPaths(): TabPath[] {
  return visibleTabs(tabSettingsSnapshot()).map((tab) => TAB_PATHS[tab.id]);
}

export function firstEnabledTabPath(): TabPath {
  return enabledTabPaths()[0] ?? TAB_PATHS.search;
}

export function isEnabledTabPath(pathname: string): boolean {
  const tab = tabIdFromPath(pathname);
  if (!tab) return true;
  return visibleTabs(tabSettingsSnapshot()).some((entry) => entry.id === tab);
}

export type SecretTabAction = "reveal" | "hide" | "none";

export function resolveSecretTabAction(unlocked: boolean, onGameTab: boolean): SecretTabAction {
  if (!unlocked) return "reveal";
  return onGameTab ? "none" : "hide";
}
