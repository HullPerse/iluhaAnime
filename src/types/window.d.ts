import type { SettingsStore } from "@/types/settings";

export type WindowChrome = Pick<
  SettingsStore,
  "customTitleBarEnabled" | "roundedWindowCorners" | "windowEffect"
>;
