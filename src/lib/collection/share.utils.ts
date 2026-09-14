import type { CollectionStatusDef } from "@/types/collection";
import type { CollectionShareDeepLink, ShareImportPlan } from "@/types/deeplink";

/**
 * Builds the receiver-side import plan: one row per snapshot item plus the
 * receiver's buckets, so the preview modal can show exactly what will happen
 * before anything is written. Every row is added as a new item (the backend
 * `create_new` strategy never matches existing rows), so no duplicate lookup.
 */
export function buildShareImportPlan(
  link: CollectionShareDeepLink,
  statuses: readonly CollectionStatusDef[]
): ShareImportPlan {
  return {
    link,
    statuses: [...statuses],
    rows: link.items.map((snapshot) => ({
      snapshot,
    })),
  };
}
