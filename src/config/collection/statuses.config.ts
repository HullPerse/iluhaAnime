import type { CollectionStatusDef } from "@/types/collection";

export const DEFAULT_COLLECTION_STATUSES: CollectionStatusDef[] = [
  {
    id: "favorites",
    label: "Favorites",
    color: "#ec4899",
    order: 0,
    isCore: true,
    kind: "private",
  },
  { id: "planned", label: "Planned", color: "#9ca3af", order: 1, isCore: true, kind: "private" },
  {
    id: "watching",
    label: "Watching",
    color: "#3b82f6",
    order: 2,
    isCore: true,
    kind: "private",
  },
  {
    id: "completed",
    label: "Completed",
    color: "#22c55e",
    order: 3,
    isCore: true,
    kind: "private",
  },
  { id: "paused", label: "Paused", color: "#f59e0b", order: 4, isCore: true, kind: "private" },
  { id: "dropped", label: "Dropped", color: "#ef4444", order: 5, isCore: true, kind: "private" },
  {
    id: "rewatching",
    label: "Rewatching",
    color: "#a855f7",
    order: 6,
    isCore: true,
    kind: "private",
  },
];

export const DEFAULT_NEW_COLOR = "#0ea5e9";

/**
 * Public statuses carry a single share link, so their size is capped: the cap keeps the
 * encoded link short enough to stay clickable and keeps the tab counter readable.
 */
export const PUBLIC_STATUS_MAX_ITEMS = 20;

export const STATUS_TAB_WIDTH = 132;
export const STATUS_SHRINK_AT = 16;
export const STATUS_SHRINK_MIN_AT = 24;
export const STATUS_SHRINK_CLASS = ["text-xs", "text-[10px]", "text-[9px]"] as const;
