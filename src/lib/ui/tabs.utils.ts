import { TAB_KEYS, orderMainTabs, visibleTabs } from "@/config/settings/tabs.config";
import { TAB_PATHS, tabIdFromPath } from "@/config/settings/tabPaths.config";
import type { TabPath } from "@/types/ui/tabPaths";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { TabId, TabSettings } from "@/types/ui/settings";
import type { SecretTabAction } from "@/types/ui/tabs";

function tabSettingsSnapshot(): TabSettings {
  return {
    mainTabOrder: settingsAtoms.mainTabOrder.get(),
    collectionTabEnabled: settingsAtoms.collectionTabEnabled.get(),
    anilistTabEnabled: settingsAtoms.anilistTabEnabled.get(),
    searchTabEnabled: settingsAtoms.searchTabEnabled.get(),
    torrentTabEnabled: settingsAtoms.torrentTabEnabled.get(),
    playerTabEnabled: settingsAtoms.playerTabEnabled.get(),
    streamTabEnabled: settingsAtoms.streamTabEnabled.get(),
    mangaTabEnabled: settingsAtoms.mangaTabEnabled.get(),
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

export function reorderMainTabs(from: TabId, to: TabId): void {
  const ids = orderMainTabs(
    [...TAB_KEYS, { id: "game" as const, key: "app.game" as const }],
    settingsAtoms.mainTabOrder.get()
  ).map((tab) => tab.id);
  const start = ids.indexOf(from);
  const end = ids.indexOf(to);

  if (start === -1 || end === -1 || start === end) return;
  const [item] = ids.splice(start, 1);

  if (!item) return;
  ids.splice(end, 0, item);
  patchSettings({ mainTabOrder: ids });
}
