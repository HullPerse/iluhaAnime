import { beforeEach, describe, expect, it } from "vitest";

import { useSearchStore } from "@/store/search.store";
import type { SearchFilters } from "@/types/search";

const FILTERS: SearchFilters = {
  minSeeders: 10,
  hasMagnet: false,
  quality: "1080p",
  language: "all",
  sizeMin: 0,
  sizeMax: 0,
  codec: "all",
};

beforeEach(() => {
  useSearchStore.setState({ filterPresets: [] });
});

describe("filter presets", () => {
  it("saves and applies presets", () => {
    useSearchStore.getState().saveFilterPreset("night", FILTERS);
    const { filterPresets } = useSearchStore.getState();
    expect(filterPresets).toHaveLength(1);
    expect(filterPresets[0]).toEqual({ name: "night", filters: FILTERS });
  });

  it("ignores blank names and replaces same-name presets", () => {
    const store = useSearchStore.getState();
    store.saveFilterPreset("   ", FILTERS);
    expect(useSearchStore.getState().filterPresets).toHaveLength(0);
    store.saveFilterPreset("night", FILTERS);
    store.saveFilterPreset("night", { ...FILTERS, minSeeders: 99 });
    const { filterPresets } = useSearchStore.getState();
    expect(filterPresets).toHaveLength(1);
    expect(filterPresets[0].filters.minSeeders).toBe(99);
  });

  it("deletes presets by name", () => {
    const store = useSearchStore.getState();
    store.saveFilterPreset("a", FILTERS);
    store.saveFilterPreset("b", FILTERS);
    store.deleteFilterPreset("a");
    expect(useSearchStore.getState().filterPresets.map((p) => p.name)).toEqual(["b"]);
  });
});
