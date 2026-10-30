import { systemApi } from "@/api/system.api";
import { attempt, reportBackgroundError } from "@/lib/attempt.utils";
import type { WindowChrome } from "@/types/window";

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
