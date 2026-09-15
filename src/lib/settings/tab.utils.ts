import { SETTINGS_TABS } from "@/config/settings/tabs.config";
import { attemptSync } from "@/lib/utils/attempt.utils";
import type { SettingsTab } from "@/types/settings";

export function readSettingsTab(): SettingsTab {
  const [tab, error] = attemptSync((): SettingsTab | null => {
    const stored = sessionStorage.getItem("settingsTab") as SettingsTab | null;
    return stored !== null && SETTINGS_TABS.has(stored) ? stored : null;
  });
  return error === null && tab !== null ? tab : "general";
}
