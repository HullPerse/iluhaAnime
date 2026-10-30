import type { CollectionStatusDef } from "@/types/anilist/collection";
import type { CollectionShareDeepLink, ShareImportPlan } from "@/types/core/deeplink";

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
