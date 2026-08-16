import { describe, expect, it } from "vitest";

import {
  EDGE_STYLES,
  FILTER_GROUPS,
  NODE_BORDER_COLORS,
  RELATION_FILTERS,
  RELATION_X,
  listStatusLabels,
  listStatusOptions,
  statusLabels,
  seasonLabels,
} from "@/config/anilist.config";
import { getAction } from "@/config/keybinds.config";
import {
  ANIME4K_PRESETS,
  FPS_OPTIONS,
  FORMAT_OPTIONS,
  GPU_LABELS,
  QUALITY_OPTIONS,
  RESOLUTIONS,
} from "@/config/player.config";

describe("keybinds getAction", () => {
  it("maps Alt+digit combos to navigation actions", () => {
    expect(getAction("Digit1", false, false, true)?.action).toBe("setSearch");
    expect(getAction("Digit2", false, false, true)?.action).toBe("setTorrent");
    expect(getAction("Digit3", false, false, true)?.action).toBe("setPlayer");
    expect(getAction("Digit4", false, false, true)?.action).toBe("setAnilist");
    expect(getAction("Digit5", false, false, true)).toBeUndefined();
  });

  it("does not match when modifiers differ", () => {
    expect(getAction("Digit1", false, false, false)).toBeUndefined();
    expect(getAction("Digit1", true, false, true)).toBeUndefined();
    expect(getAction("KeyA", false, false, true)).toBeUndefined();
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
    expect(listStatusLabels.COMPLETED).toBe("anilist.listStatus.COMPLETED");
  });

  it("derives list status options from labels", () => {
    expect(listStatusOptions).toHaveLength(
      Object.keys(listStatusLabels).length
    );
    expect(listStatusOptions[0]).toEqual({
      label: "anilist.listStatus.CURRENT",
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
    expect(QUALITY_OPTIONS.map((q) => q.value)).toEqual([
      "ultrafast",
      "fast",
      "slow",
      "veryslow",
    ]);
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
