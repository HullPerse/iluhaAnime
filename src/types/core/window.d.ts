import type { SettingsStore } from "@/types/ui/settings";

export type WindowChrome = Pick<
  SettingsStore,
  "customTitleBarEnabled" | "roundedWindowCorners" | "windowEffect"
>;
