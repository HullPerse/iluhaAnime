import { useCallback, useEffect, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/types/ui/hotkeys";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { showError } from "@/lib/core/notification.utils";
import type {
  ScreenshotCapture,
  ScreenshotCaptureOptions,
  ScreenshotSession,
  ScreenshotVideoRect,
} from "@/types/core/screenshot";

const SCREENSHOT_DEFS: ResolvedHotkeyDef<"capture">[] = [
  { id: "capture", chord: "ctrl+Shift+KeyP", repeat: "once", keybindId: "screenshot.capture" },
];

function videoRectFor(element: HTMLElement | null): ScreenshotVideoRect | undefined {
  if (element === null) return undefined;
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (viewportWidth <= 0 || viewportHeight <= 0) return undefined;
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return {
    x: Math.max(0, rect.left / viewportWidth),
    y: Math.max(0, rect.top / viewportHeight),
    width: Math.min(1, rect.width / viewportWidth),
    height: Math.min(1, rect.height / viewportHeight),
  };
}

export function useScreenshot(options?: ScreenshotCaptureOptions): ScreenshotSession {
  const { t } = useI18n();
  const [shot, setShot] = useState<ScreenshotCapture | null>(null);
  const captureRef = useRef<ScreenshotCapture | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const optionsRef = useRef<ScreenshotCaptureOptions | undefined>(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const setCapture = useCallback((next: ScreenshotCapture | null) => {
    captureRef.current = next;
    setShot(next);
  }, []);

  const request = useCallback(async () => {
    if (inFlightRef.current || captureRef.current !== null) return;
    inFlightRef.current = true;
    const videoRect = videoRectFor(optionsRef.current?.videoElement?.() ?? null);
    const [data, error] = await attempt(systemApi.captureScreenshot(videoRect));
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
      .catch((error: unknown) => reportBackgroundError("srchooksscreenshot", error));
  }, [setCapture]);

  return { capture: shot, close };
}
