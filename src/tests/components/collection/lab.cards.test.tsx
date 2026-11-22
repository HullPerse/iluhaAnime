import { describe, expect, it } from "vitest";

import { routeTree } from "@/routes/__root.tree";

describe("cards design lab", () => {
  it("registers the route in dev only", () => {
    expect(import.meta.env.DEV).toBe(true);
    const paths = (routeTree.children ?? []).map((child) =>
      "path" in child.options ? child.options.path : undefined
    );

    expect(paths).toContain("/lab/cards");
  });
});
