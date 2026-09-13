import { SETTINGS_TABS } from "@/config/settings/tabs.config";
import type { SettingsTab } from "@/types/settings";

export function readSettingsTab(): SettingsTab {
  try {
    const stored = sessionStorage.getItem("settingsTab") as SettingsTab | null;
    if (stored && SETTINGS_TABS.has(stored)) return stored;
  } catch {}
  return "general";
}
