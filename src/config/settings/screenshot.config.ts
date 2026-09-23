import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { ScreenshotFormat } from "@/types/screenshot";

export const SCREENSHOT_NAME_PREFIX = "iluhaAnime_screenshot";

export const SCREENSHOT_FORMATS: readonly ScreenshotFormat[] = ["png", "jpeg"];

export const SCREENSHOT_FORMAT_LABELS: Record<ScreenshotFormat, TranslationKey> = {
  png: "screenshot.format.png",
  jpeg: "screenshot.format.jpeg",
};

export const CROP_MIN_SIZE = 8;

export const CROP_SNAP_DISPLAY_PX = 6;

export const CROP_DIM_OPACITY = 0.6;

export const ANNOTATION_DEFAULT_COLOR = "#e5342f";

export const ANNOTATION_BRUSH_SIZES: readonly number[] = [3, 6, 12];

export const ANNOTATION_TEXT_SIZES: readonly number[] = [18, 28, 42];

export const ANNOTATION_DEFAULT_BRUSH_SIZE = 6;

export const ANNOTATION_DEFAULT_TEXT_SIZE = 28;

export const ANNOTATION_BLUR_SIGMA_FACTOR = 1.5;

export const ANNOTATION_POINT_SPACING = 2;

export const ANNOTATION_TEXT_LINE_HEIGHT = 1.2;

export const ANNOTATION_HISTORY_LIMIT = 60;

export const CROP_ZOOM_FIT = 1;
export const CROP_ZOOM_MIN = 0.5;
export const CROP_ZOOM_MAX = 8;
export const CROP_ZOOM_STEP = 1.2;
export const CROP_ZOOM_PRECISION = 1000;

export const SCREENSHOT_HOTKEY = {
  code: "KeyP",
  ctrl: true,
  shift: true,
  alt: false,
} as const;
