import type { SearchFilters } from "@/types/search";

export function countActiveFilters(f: SearchFilters): number {
  let count = 0;
  if (f.minSeeders > 0) count++;
  if (f.hasMagnet) count++;
  if (f.quality !== "all") count++;
  if (f.language !== "all") count++;
  if (f.sizeMin > 0 || f.sizeMax > 0) count++;
  if (f.codec !== "all") count++;
  return count;
}
