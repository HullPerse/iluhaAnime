import { systemApi } from "@/api/system.api";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type { SettingsStore } from "@/types/settings";

export type WindowChrome = Pick<
  SettingsStore,
  "customTitleBarEnabled" | "roundedWindowCorners" | "windowEffect"
>;

export async function applyWindowChrome(chrome: WindowChrome): Promise<void> {
  const [, error] = await attempt(
    systemApi.setWindowChrome(
      !chrome.customTitleBarEnabled,
      chrome.windowEffect,
      chrome.roundedWindowCorners
    )
  );
  if (error) reportBackgroundError("settings.window.chrome", error);
}
