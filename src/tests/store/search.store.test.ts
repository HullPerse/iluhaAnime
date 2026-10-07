import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteSearchFilterPreset,
  saveSearchFilterPreset,
  searchAtoms,
} from "@/store/search.store";
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
  searchAtoms.filterPresets.set([]);
});

describe("filter presets", () => {
  it("saves and applies presets", () => {
    saveSearchFilterPreset("night", FILTERS);
    const filterPresets = searchAtoms.filterPresets.get();
    expect(filterPresets).toHaveLength(1);
    expect(filterPresets[0]).toEqual({ name: "night", filters: FILTERS });
  });

  it("ignores blank names and replaces same-name presets", () => {
    saveSearchFilterPreset("   ", FILTERS);
    expect(searchAtoms.filterPresets.get()).toHaveLength(0);
    saveSearchFilterPreset("night", FILTERS);
    saveSearchFilterPreset("night", { ...FILTERS, minSeeders: 99 });
    const filterPresets = searchAtoms.filterPresets.get();
    expect(filterPresets).toHaveLength(1);
    expect(filterPresets[0].filters.minSeeders).toBe(99);
  });

  it("deletes presets by name", () => {
    saveSearchFilterPreset("a", FILTERS);
    saveSearchFilterPreset("b", FILTERS);
    deleteSearchFilterPreset("a");
    expect(searchAtoms.filterPresets.get().map((p) => p.name)).toEqual(["b"]);
  });
});
