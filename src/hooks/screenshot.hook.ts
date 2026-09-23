import { useCallback, useEffect, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { useI18n } from "@/lib/locale/i18n.utils";
import { matchesScreenshotHotkey } from "@/lib/settings/screenshot.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { ScreenshotCapture } from "@/types/screenshot";

export interface ScreenshotSession {
  capture: ScreenshotCapture | null;
  close: () => void;
}

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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!matchesScreenshotHotkey(event)) return;
      event.preventDefault();
      request();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [request]);

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
