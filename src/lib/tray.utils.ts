import type { TrayMenuEntry, TrayTabEntry } from "@/types/tray";

export const TRAY_ICON_ID = "iluhaanime-tray";

export function shouldHideOnClose(minimizeToTray: boolean, allowQuit: boolean): boolean {
  return minimizeToTray && !allowQuit;
}

export function buildTrayMenuEntries(
  tabs: readonly TrayTabEntry[],
  quitText: string
): TrayMenuEntry[] {
  const entries: TrayMenuEntry[] = tabs.map((tab): TrayMenuEntry => ({
    kind: "tab",
    id: `tray-tab-${tab.id}`,
    tabId: tab.id,
    text: tab.label,
  }));
  entries.push(
    { kind: "separator", id: "tray-separator" },
    { kind: "quit", id: "tray-quit", text: quitText }
  );
  return entries;
}
