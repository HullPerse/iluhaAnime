import type { CollectionStatusDef } from "@/types/collection";

export const DEFAULT_COLLECTION_STATUSES: CollectionStatusDef[] = [
  { id: "favorites", label: "Favorites", color: "#ec4899", order: 0, isCore: true },
  { id: "planned", label: "Planned", color: "#9ca3af", order: 1, isCore: true },
  {
    id: "watching",
    label: "Watching",
    color: "#3b82f6",
    order: 2,
    isCore: true,
  },
  {
    id: "completed",
    label: "Completed",
    color: "#22c55e",
    order: 3,
    isCore: true,
  },
  { id: "paused", label: "Paused", color: "#f59e0b", order: 4, isCore: true },
  { id: "dropped", label: "Dropped", color: "#ef4444", order: 5, isCore: true },
  {
    id: "rewatching",
    label: "Rewatching",
    color: "#a855f7",
    order: 6,
    isCore: true,
  },
];

export const DEFAULT_NEW_COLOR = "#0ea5e9";
