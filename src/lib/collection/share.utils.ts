import type { CollectionStatusDef } from "@/types/collection";
import type { CollectionShareDeepLink, ShareImportPlan } from "@/types/deeplink";

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
