import type { TabId } from "@/types/settings";

export interface TrayTabEntry {
  id: TabId;
  label: string;
}

export type TrayMenuEntry =
  | { kind: "tab"; id: string; tabId: TabId; text: string }
  | { kind: "separator"; id: string }
  | { kind: "quit"; id: string; text: string };

export interface TrayTab {
  id: TabId;
  label: string;
}
