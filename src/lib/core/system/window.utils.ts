import { systemApi } from "@/api/system.api";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import type { WindowChrome } from "@/types/core/window";

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
