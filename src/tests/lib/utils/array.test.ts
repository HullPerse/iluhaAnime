import { describe, expect, it } from "vitest";

import { uniqueById } from "@/lib/utils/array.utils";

describe("uniqueById", () => {
  it("keeps the first occurrence of each id", () => {
    const items = [
      { id: 95, name: "Hero" },
      { id: 95, name: "Hero duplicate" },
      { id: 96, name: "Sidekick" },
    ];
    expect(uniqueById(items, (item) => item.id)).toEqual([
      { id: 95, name: "Hero" },
      { id: 96, name: "Sidekick" },
    ]);
  });

  it("supports a nested id selector", () => {
    const edges = [
      { role: "MAIN", character: { id: 95 } },
      { role: "SUPPORTING", character: { id: 95 } },
      { role: "MAIN", character: { id: 96 } },
    ];
    expect(uniqueById(edges, (edge) => edge.character.id)).toEqual([
      { role: "MAIN", character: { id: 95 } },
      { role: "MAIN", character: { id: 96 } },
    ]);
  });

  it("returns an empty list untouched", () => {
    expect(uniqueById([], (item: { id: number }) => item.id)).toEqual([]);
  });
});
