import { SCREENSHOT_NAME_PREFIX } from "@/config/screenshot.config";

export function defaultScreenshotName(): string {
  return SCREENSHOT_NAME_PREFIX;
}

export function canSaveScreenshot(name: string, dir: string): boolean {
  return name.trim().length > 0 && dir.trim().length > 0;
}
