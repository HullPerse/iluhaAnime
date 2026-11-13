import { STATUS_SHRINK_AT, STATUS_SHRINK_MIN_AT } from "@/config/anilist/statuses.config";

/** Picks the label shrink level for a status tab that is running out of width. */
export function shrinkLevelFor(text: string): 0 | 1 | 2 {
  if (text.length > STATUS_SHRINK_MIN_AT) return 2;
  if (text.length > STATUS_SHRINK_AT) return 1;
  return 0;
}
