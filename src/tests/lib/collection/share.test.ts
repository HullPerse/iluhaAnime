import { describe, expect, it } from "vitest";

import { buildShareImportPlan } from "@/lib/collection/share.utils";
import type { CollectionStatusDef } from "@/types/collection";
import type { CollectionShareDeepLink } from "@/types/deeplink";

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true, kind: "private" },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: true, kind: "private" },
  { id: "ideas", label: "Ideas,Ideas", color: "#f59e0b", order: 2, isCore: false, kind: "private" },
];

function makeLink(items: CollectionShareDeepLink["items"]): CollectionShareDeepLink {
  return { version: 1, label: "Ideas", items };
}

const snapshot = {
  title: "Frieren",
  type: "anime" as const,
  year: 2023,
  status: "watching",
  externalIds: { anilist: 154587 },
  coverUrl: null,
};

describe("buildShareImportPlan", () => {
  it("keeps one row per snapshot item without duplicate marking", () => {
    const plan = buildShareImportPlan(
      makeLink([
        snapshot,
        { ...snapshot, title: "Unknown Show", externalIds: {}, year: null, status: "friend_only" },
      ]),
      STATUSES
    );
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]?.snapshot.title).toBe("Frieren");
    expect(plan.rows[1]?.snapshot.title).toBe("Unknown Show");
    expect(plan.statuses).toEqual(STATUSES);
  });

  it("does not mutate the passed statuses", () => {
    const frozen = [...STATUSES];
    buildShareImportPlan(makeLink([snapshot]), STATUSES);
    expect(STATUSES).toEqual(frozen);
  });
});
