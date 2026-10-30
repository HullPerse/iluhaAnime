import { Bookmark, Check, Pause, Play, RotateCcw, X, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/types/i18n";

export const CELL_LEVELS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
export const CELL_SIZE = 16;
export const CELL_GAP = 4;

export const ACTIVITY_STATUS_ICONS: Record<string, LucideIcon> = {
  CURRENT: Play,
  COMPLETED: Check,
  DROPPED: X,
  PLANNING: Bookmark,
  PAUSED: Pause,
  REPEATING: RotateCcw,
};

export const ACTIVITY_STATUS_LABELS: Record<string, TranslationKey> = {
  CURRENT: "anilist.activity.status.CURRENT",
  COMPLETED: "anilist.activity.status.COMPLETED",
  DROPPED: "anilist.activity.status.DROPPED",
  PLANNING: "anilist.activity.status.PLANNING",
  PAUSED: "anilist.activity.status.PAUSED",
  REPEATING: "anilist.activity.status.REPEATING",
};

export const ACTIVITY_STATUS_FILTERS: { value: string; key: TranslationKey }[] = [
  { value: "", key: "anilist.activity.filter.all" },
  { value: "CURRENT", key: "anilist.activity.filter.current" },
  { value: "COMPLETED", key: "anilist.activity.filter.completed" },
  { value: "DROPPED", key: "anilist.activity.filter.dropped" },
  { value: "PAUSED", key: "anilist.activity.filter.paused" },
  { value: "PLANNING", key: "anilist.activity.filter.planning" },
  { value: "REPEATING", key: "anilist.activity.filter.repeating" },
];
