import { SCREENSHOT_NAME_PREFIX } from "@/config/settings/screenshot.config";

export function defaultScreenshotName(): string {
  return SCREENSHOT_NAME_PREFIX;
}

export function canSaveScreenshot(name: string, dir: string): boolean {
  return name.trim().length > 0 && dir.trim().length > 0;
}
