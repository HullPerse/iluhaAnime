import type { TabId } from "@/types/settings";

export const TRAY_ICON_ID = "iluhaanime-tray";

export interface TrayTabEntry {
  id: TabId;
  label: string;
}

export type TrayMenuEntry =
  | { kind: "tab"; id: string; tabId: TabId; text: string }
  | { kind: "separator"; id: string }
  | { kind: "quit"; id: string; text: string };

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
