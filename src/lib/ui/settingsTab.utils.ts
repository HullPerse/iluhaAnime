import type { SettingsTab } from "@/types/ui/settings";

let lastTab: SettingsTab | null = null;

export function getLastSettingsTab(): SettingsTab | null {
  return lastTab;
}

export function setLastSettingsTab(tab: SettingsTab): void {
  lastTab = tab;
}
