import { useCallback, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { useHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { HotkeyDef } from "@/lib/hotkeys/chord.hotkeys";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { ScreenshotCapture } from "@/types/screenshot";

export interface ScreenshotSession {
  capture: ScreenshotCapture | null;
  close: () => void;
}

const SCREENSHOT_DEFS: HotkeyDef<"capture">[] = [
  { id: "capture", chord: "ctrl+Shift+KeyP", repeat: "once" },
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

  useHotkeys(SCREENSHOT_DEFS, {
    onAction: () => request(),
  });

  const close = useCallback(() => {
    const pending = captureRef.current;
    setCapture(null);
    if (!pending) return;
    attempt(systemApi.discardScreenshot(pending.path)).then(([, error]) => {
      if (error) reportBackgroundError("screenshot.discard", error);
    });
  }, [setCapture]);

  return { capture: shot, close };
}
