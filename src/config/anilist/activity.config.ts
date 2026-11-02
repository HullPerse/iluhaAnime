import { Bookmark, Check, Pause, Play, RotateCcw, X, type LucideIcon } from "lucide-react";
import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import data from "./activity.data.json";

const ActivityDataSchema = z.object({
  ACTIVITY_STATUS_FILTERS: z.array(z.object({ key: z.string(), value: z.string() })),
  ACTIVITY_STATUS_LABELS: z.record(z.string(), z.string()),
  CELL_GAP: z.number(),
  CELL_LEVELS: z.array(z.string()),
  CELL_SIZE: z.number(),
});

const parsed = ActivityDataSchema.parse(data);

export const CELL_LEVELS = parsed.CELL_LEVELS;
export const CELL_SIZE = parsed.CELL_SIZE;
export const CELL_GAP = parsed.CELL_GAP;

export const ACTIVITY_STATUS_ICONS: Record<string, LucideIcon> = {
  COMPLETED: Check,
  CURRENT: Play,
  DROPPED: X,
  PAUSED: Pause,
  PLANNING: Bookmark,
  REPEATING: RotateCcw,
};

export const ACTIVITY_STATUS_LABELS = parsed.ACTIVITY_STATUS_LABELS as Record<string, TranslationKey>;

export const ACTIVITY_STATUS_FILTERS = parsed.ACTIVITY_STATUS_FILTERS as { value: string; key: TranslationKey }[];