import { visibleTabs } from "@/config/settings/tabs.config";
import { TAB_PATHS, tabIdFromPath } from "@/config/settings/tabPaths.config";
import type { TabPath } from "@/types/ui/tabPaths";
import { settingsAtoms } from "@/store/settings.store";
import type { TabSettings } from "@/types/ui/settings";
import type { SecretTabAction } from "@/types/ui/tabs";

function tabSettingsSnapshot(): TabSettings {
  return {
    collectionTabEnabled: settingsAtoms.collectionTabEnabled.get(),
    anilistTabEnabled: settingsAtoms.anilistTabEnabled.get(),
    searchTabEnabled: settingsAtoms.searchTabEnabled.get(),
    torrentTabEnabled: settingsAtoms.torrentTabEnabled.get(),
    playerTabEnabled: settingsAtoms.playerTabEnabled.get(),
    streamTabEnabled: settingsAtoms.streamTabEnabled.get(),
    newsTabEnabled: settingsAtoms.newsTabEnabled.get(),
    gameTabUnlocked: settingsAtoms.gameTabUnlocked.get(),
  };
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

export function resolveSecretTabAction(unlocked: boolean, onGameTab: boolean): SecretTabAction {
  if (!unlocked) return "reveal";
  return onGameTab ? "none" : "hide";
}
