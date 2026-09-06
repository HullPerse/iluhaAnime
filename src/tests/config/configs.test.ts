import { describe, expect, it } from "vitest";

import {
  EDGE_STYLES,
  FILTER_GROUPS,
  NODE_BORDER_COLORS,
  RELATION_FILTERS,
  RELATION_X,
} from "@/config/anilist/graph.config";
import {
  listStatusLabels,
  listStatusOptions,
  statusLabels,
  seasonLabels,
} from "@/config/anilist/labels.config";
import {
  FPS_OPTIONS,
  FORMAT_OPTIONS,
  GPU_LABELS,
  QUALITY_OPTIONS,
  RESOLUTIONS,
} from "@/config/player/options.config";
import { ANIME4K_PRESETS } from "@/config/player/presets.config";
import { tabForAltDigit } from "@/config/settings/tabs.config";

const ALL_TABS = {
  collectionTabEnabled: true,
  anilistTabEnabled: true,
  searchTabEnabled: true,
  torrentTabEnabled: true,
  playerTabEnabled: true,
};

const NO_COLLECTION_ANILIST = {
  collectionTabEnabled: false,
  anilistTabEnabled: false,
  searchTabEnabled: true,
  torrentTabEnabled: true,
  playerTabEnabled: true,
};

describe("tabForAltDigit", () => {
  it("maps Alt+digit to the visible tab at that position", () => {
    expect(tabForAltDigit(ALL_TABS, 1)).toBe("search");
    expect(tabForAltDigit(ALL_TABS, 2)).toBe("torrent");
    expect(tabForAltDigit(ALL_TABS, 3)).toBe("player");
    expect(tabForAltDigit(ALL_TABS, 4)).toBe("anilist");
    expect(tabForAltDigit(ALL_TABS, 5)).toBe("collection");
    expect(tabForAltDigit(ALL_TABS, 6)).toBe("settings");
    expect(tabForAltDigit(ALL_TABS, 7)).toBeUndefined();
  });

  it("follows the visible strip when tabs are disabled", () => {
    expect(tabForAltDigit(NO_COLLECTION_ANILIST, 1)).toBe("search");
    expect(tabForAltDigit(NO_COLLECTION_ANILIST, 2)).toBe("torrent");
    expect(tabForAltDigit(NO_COLLECTION_ANILIST, 3)).toBe("player");
    expect(tabForAltDigit(NO_COLLECTION_ANILIST, 4)).toBe("settings");
    expect(tabForAltDigit(NO_COLLECTION_ANILIST, 5)).toBeUndefined();
  });

  it("ignores non-positive and non-integer digits", () => {
    expect(tabForAltDigit(ALL_TABS, 0)).toBeUndefined();
    expect(tabForAltDigit(ALL_TABS, -1)).toBeUndefined();
    expect(tabForAltDigit(ALL_TABS, 1.5)).toBeUndefined();
    expect(tabForAltDigit(ALL_TABS, Number.NaN)).toBeUndefined();
  });
});

describe("anilist config integrity", () => {
  it("every relation filter has a filter group", () => {
    for (const filter of RELATION_FILTERS) {
      expect(FILTER_GROUPS[filter]).toBeDefined();
      expect(FILTER_GROUPS[filter].length).toBeGreaterThan(0);
    }
  });

  it("every relation filter has an edge style and border color", () => {
    for (const filter of RELATION_FILTERS) {
      expect(EDGE_STYLES[filter]).toBeDefined();
      expect(NODE_BORDER_COLORS[filter]).toBeDefined();
    }
  });

  it("relation x-positions are normalized", () => {
    for (const [rel, x] of Object.entries(RELATION_X)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(EDGE_STYLES[rel]).toBeDefined();
    }
  });

  it("provides status, season and list-status labels as i18n keys", () => {
    expect(statusLabels.FINISHED).toBe("anilist.status.FINISHED");
    expect(statusLabels.RELEASING).toBe("anilist.status.RELEASING");
    expect(seasonLabels.WINTER).toBe("anilist.season.WINTER");
    expect(listStatusLabels.COMPLETED).toBe("anilist.list.status.COMPLETED");
  });

  it("derives list status options from labels", () => {
    expect(listStatusOptions).toHaveLength(Object.keys(listStatusLabels).length);
    expect(listStatusOptions[0]).toEqual({
      label: "anilist.list.status.CURRENT",
      value: "CURRENT",
    });
  });
});

describe("player config data", () => {
  it("exposes GPU labels for every encoder", () => {
    expect(GPU_LABELS.cpu).toContain("CPU");
    expect(GPU_LABELS.nvenc).toContain("NVENC");
    expect(GPU_LABELS.amf).toContain("AMF");
    expect(GPU_LABELS.qsv).toContain("QSV");
  });

  it("provides resolution, fps, quality and format options", () => {
    expect(RESOLUTIONS[0].value).toBe("original");
    expect(RESOLUTIONS.some((r) => r.value === "3840x2160")).toBe(true);
    expect(FPS_OPTIONS.some((f) => f.value === "60i")).toBe(true);
    expect(QUALITY_OPTIONS.map((q) => q.value)).toEqual(["ultrafast", "fast", "slow", "veryslow"]);
    expect(FORMAT_OPTIONS.map((f) => f.value)).toContain("mkv");
  });

  it("every anime4k preset has shaders and a quality", () => {
    expect(ANIME4K_PRESETS.length).toBeGreaterThan(0);
    for (const preset of ANIME4K_PRESETS) {
      expect(preset.shaders.length).toBeGreaterThan(0);
      expect(preset.quality).toMatch(/^(ultrafast|fast|slow|veryslow)$/);
      expect(preset.gpuBackend).toMatch(/^(cpu|gpu)$/);
    }
  });
});
