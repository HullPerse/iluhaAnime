import * as z from "zod/mini";

import type { HotkeyDef } from "@/types/core/chordHotkeys";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { ScreenshotFormat } from "@/types/core/screenshot";
import data from "./screenshot.data.json";

const ScreenshotDataSchema = z.object({
  ANNOTATION_BLUR_SIGMA_FACTOR: z.number(),
  ANNOTATION_BRUSH_SIZES: z.array(z.number()),
  ANNOTATION_DEFAULT_BRUSH_SIZE: z.number(),
  ANNOTATION_DEFAULT_COLOR: z.string(),
  ANNOTATION_DEFAULT_TEXT_SIZE: z.number(),
  ANNOTATION_HISTORY_LIMIT: z.number(),
  ANNOTATION_POINT_SPACING: z.number(),
  ANNOTATION_TEXT_LINE_HEIGHT: z.number(),
  ANNOTATION_TEXT_SIZES: z.array(z.number()),
  CROP_DIM_OPACITY: z.number(),
  CROP_MIN_SIZE: z.number(),
  CROP_SNAP_DISPLAY_PX: z.number(),
  CROP_ZOOM_FIT: z.number(),
  CROP_ZOOM_MAX: z.number(),
  CROP_ZOOM_MIN: z.number(),
  CROP_ZOOM_PRECISION: z.number(),
  CROP_ZOOM_STEP: z.number(),
  SCREENSHOT_FORMAT_LABELS: z.record(z.string(), z.string()),
  SCREENSHOT_FORMATS: z.array(z.string()),
  SCREENSHOT_HISTORY_DEFS: z.array(z.object({ chord: z.string(), id: z.string(), repeat: z.string() })),
  SCREENSHOT_NAME_PREFIX: z.string(),
});

const parsed = ScreenshotDataSchema.parse(data);

export const SCREENSHOT_HISTORY_DEFS = parsed.SCREENSHOT_HISTORY_DEFS as readonly HotkeyDef<"undo" | "redo">[];
export const SCREENSHOT_NAME_PREFIX = parsed.SCREENSHOT_NAME_PREFIX;
export const SCREENSHOT_FORMATS = parsed.SCREENSHOT_FORMATS as readonly ScreenshotFormat[];
export const SCREENSHOT_FORMAT_LABELS = parsed.SCREENSHOT_FORMAT_LABELS as Record<ScreenshotFormat, TranslationKey>;
export const CROP_MIN_SIZE = parsed.CROP_MIN_SIZE;
export const CROP_SNAP_DISPLAY_PX = parsed.CROP_SNAP_DISPLAY_PX;
export const CROP_DIM_OPACITY = parsed.CROP_DIM_OPACITY;
export const ANNOTATION_DEFAULT_COLOR = parsed.ANNOTATION_DEFAULT_COLOR;
export const ANNOTATION_BRUSH_SIZES = parsed.ANNOTATION_BRUSH_SIZES as readonly number[];
export const ANNOTATION_TEXT_SIZES = parsed.ANNOTATION_TEXT_SIZES as readonly number[];
export const ANNOTATION_DEFAULT_BRUSH_SIZE = parsed.ANNOTATION_DEFAULT_BRUSH_SIZE;
export const ANNOTATION_DEFAULT_TEXT_SIZE = parsed.ANNOTATION_DEFAULT_TEXT_SIZE;
export const ANNOTATION_BLUR_SIGMA_FACTOR = parsed.ANNOTATION_BLUR_SIGMA_FACTOR;
export const ANNOTATION_POINT_SPACING = parsed.ANNOTATION_POINT_SPACING;
export const ANNOTATION_TEXT_LINE_HEIGHT = parsed.ANNOTATION_TEXT_LINE_HEIGHT;
export const ANNOTATION_HISTORY_LIMIT = parsed.ANNOTATION_HISTORY_LIMIT;
export const CROP_ZOOM_FIT = parsed.CROP_ZOOM_FIT;
export const CROP_ZOOM_MIN = parsed.CROP_ZOOM_MIN;
export const CROP_ZOOM_MAX = parsed.CROP_ZOOM_MAX;
export const CROP_ZOOM_STEP = parsed.CROP_ZOOM_STEP;
export const CROP_ZOOM_PRECISION = parsed.CROP_ZOOM_PRECISION;