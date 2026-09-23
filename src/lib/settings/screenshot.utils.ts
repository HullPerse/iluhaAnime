import { SCREENSHOT_HOTKEY, SCREENSHOT_NAME_PREFIX } from "@/config/settings/screenshot.config";

export interface ScreenshotKeyEvent {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export function matchesScreenshotHotkey(event: ScreenshotKeyEvent): boolean {
  return (
    event.code === SCREENSHOT_HOTKEY.code &&
    event.ctrlKey === SCREENSHOT_HOTKEY.ctrl &&
    event.shiftKey === SCREENSHOT_HOTKEY.shift &&
    event.altKey === SCREENSHOT_HOTKEY.alt &&
    !event.metaKey
  );
}

export function defaultScreenshotName(): string {
  return SCREENSHOT_NAME_PREFIX;
}

export function canSaveScreenshot(name: string, dir: string): boolean {
  return name.trim().length > 0 && dir.trim().length > 0;
}
