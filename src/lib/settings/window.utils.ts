import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { SettingsStore } from "@/types/settings";

export type WindowChrome = Pick<
  SettingsStore,
  "customTitleBarEnabled" | "roundedWindowCorners" | "windowEffect"
>;

export async function applyWindowChrome(chrome: WindowChrome): Promise<void> {
  try {
    await invokeTyped("set_window_chrome", {
      decorations: !chrome.customTitleBarEnabled,
      effect: chrome.windowEffect,
      roundedCorners: chrome.roundedWindowCorners,
    });
  } catch (error: unknown) {
    reportBackgroundError("settings.window.chrome", error);
  }
}
