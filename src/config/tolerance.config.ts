import type { TagToleranceKey } from "@/types/search";

export const DEFAULT_TAG_TOLERANCES: Record<TagToleranceKey, number> = {
  episodes: 2,
  progress: 5,
  rating: 1,
  year: 2,
};

export function clampTolerance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(99, Math.max(0, Math.floor(value)));
}
