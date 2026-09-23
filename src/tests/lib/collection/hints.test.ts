import { describe, expect, it } from "vitest";

import { buildCollectionQueryHints } from "@/lib/collection/hints.utils";

const t = (key: string) => key;

describe("buildCollectionQueryHints", () => {
  it("keeps the filter key hints", () => {
    const hints = buildCollectionQueryHints([], [], t);
    expect(hints).toContainEqual({ kind: "local", value: "year=" });
    expect(hints).toContainEqual({ kind: "local", value: "sort=date" });
  });

  it("appends operator examples with explanations", () => {
    const hints = buildCollectionQueryHints([], [], t);
    expect(hints).toContainEqual({
      kind: "local",
      value: "^title",
      subtitle: "search.operator.prefix",
      operator: true,
    });
    expect(hints).toContainEqual({
      kind: "local",
      value: "title$",
      subtitle: "search.operator.suffix",
      operator: true,
    });
    expect(hints).toContainEqual({
      kind: "local",
      value: "'exact",
      subtitle: "search.operator.exact",
      operator: true,
    });
    expect(hints).toContainEqual({
      kind: "local",
      value: "!skip",
      subtitle: "search.operator.exclude",
      operator: true,
    });
  });
});
