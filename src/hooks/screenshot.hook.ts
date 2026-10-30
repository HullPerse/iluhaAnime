import { useCallback, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/types/ui/hotkeys";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError } from "@/lib/core/attempt.utils";
import { showError } from "@/lib/core/notification.utils";
import type { ScreenshotCapture } from "@/types/core/screenshot";

export interface ScreenshotSession {
  capture: ScreenshotCapture | null;
  close: () => void;
}

const SCREENSHOT_DEFS: ResolvedHotkeyDef<"capture">[] = [
  { id: "capture", chord: "ctrl+Shift+KeyP", repeat: "once", keybindId: "screenshot.capture" },
];

export function useScreenshot(): ScreenshotSession {
  const { t } = useI18n();
  const [shot, setShot] = useState<ScreenshotCapture | null>(null);
  const captureRef = useRef<ScreenshotCapture | null>(null);
  const inFlightRef = useRef(false);

  const setCapture = useCallback((next: ScreenshotCapture | null) => {
    captureRef.current = next;
    setShot(next);
  }, []);

  const request = useCallback(async () => {
    if (inFlightRef.current || captureRef.current !== null) return;
    inFlightRef.current = true;
    const [data, error] = await attempt(systemApi.captureScreenshot());
    inFlightRef.current = false;
    if (error) {
      showError(t("common.error"), t("screenshot.capture.error"));
      return;
    }
    setCapture(data);
  }, [setCapture, t]);

  useResolvedHotkeys(SCREENSHOT_DEFS, {
    onAction: () => request(),
  });

  const close = useCallback(() => {
    const pending = captureRef.current;
    setCapture(null);
    if (!pending) return;
    attempt(systemApi.discardScreenshot(pending.path))
      .then(([, error]) => {
        if (error) reportBackgroundError("screenshot.discard", error);
        return null;
      })
      .catch(() => {});
  }, [setCapture]);

  return { capture: shot, close };
}
