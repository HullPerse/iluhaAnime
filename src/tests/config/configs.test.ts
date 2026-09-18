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
import { THEMES } from "@/config/settings/themes.config";
import {
  DITHER_DEFAULT_PALETTE,
  DITHER_DEFAULTS,
  DITHER_PALETTE_PRESETS,
  DITHER_PRESETS,
  DITHER_VIOLET_RAMP_PALETTE,
  resolveDitherPreset,
} from "@/config/utils/dither.config";

import packageJson from "../../../package.json";
import cargoToml from "../../../src-tauri/Cargo.toml?raw";
import tauriConf from "../../../src-tauri/tauri.conf.json";

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

describe("dither presets", () => {
  it("resolves the empty preset to neutral bypass values", () => {
    const empty = resolveDitherPreset("empty");
    expect(empty.levels).toBe(256);
    expect(empty.ditherStrength).toBe(0);
    expect(empty.paletteBias).toBe(0);
    expect(empty.shadowCrush).toBe(0);
  });
  it("exposes eight complete presets", () => {
    expect(DITHER_PRESETS.map((preset) => preset.id)).toEqual([
      "empty",
      "default",
      "deep",
      "soft",
      "natural",
      "capy",
      "ascii",
      "crt",
    ]);
    const expected = Object.keys(DITHER_DEFAULTS)
      .filter((key) => key !== "scale")
      .sort();
    for (const preset of DITHER_PRESETS) {
      expect(Object.keys(preset.options).sort()).toEqual(expected);
    }
  });

  it("keeps the natural preset clean of channel tricks", () => {
    const natural = resolveDitherPreset("natural");
    expect(natural.ditherMatrix).toBe("blue64");
    expect(natural.ink).toBe(0);
    expect(natural.edgeDistortion).toBe(0);
    expect(natural.misregistration).toBe(0);
    expect(natural.vignette).toBe(0);
    expect(natural.paletteBias).toBeGreaterThan(0.2);
    expect(natural.palette).toEqual(DITHER_DEFAULT_PALETTE);
  });
  it("gives the capy preset the fine bayer look with a dark falloff", () => {
    const capy = resolveDitherPreset("capy");
    expect(capy.ditherMatrix).toBe("bayer4");
    expect(capy.levels).toBe(24);
    expect(capy.halftone).toBe(0);
    expect(capy.vignette).toBeGreaterThan(0);
    expect(capy.shadowCrush).toBeGreaterThan(0);
  });
  it("gives the crt preset nonzero barrel, radial aberration, and channel shift", () => {
    const crt = resolveDitherPreset("crt");
    expect(crt.barrel).toBeGreaterThan(0);
    expect(crt.chromaticRadius).toBeGreaterThan(0);
    expect(crt.misregistration).toBeGreaterThan(0);
    expect(crt.wave).toBe(0);
  });
  it("gives the ascii preset the violet ramp and the glyph stage", () => {
    const ascii = resolveDitherPreset("ascii");
    expect(ascii.ascii).toBeGreaterThan(0.5);
    expect(ascii.asciiSize).toBe(12);
    expect(ascii.asciiFringe).toBeGreaterThan(0);
    expect(ascii.halftoneSize).toBe(0);
    expect(ascii.palette).toEqual(DITHER_VIOLET_RAMP_PALETTE);
  });
  it("defaults the grain to gray", () => {
    expect(resolveDitherPreset("default").grayGrain).toBe(true);
  });
});

describe("dither palette presets", () => {
  it("exposes the six documented presets", () => {
    expect(DITHER_PALETTE_PRESETS.map((preset) => preset.id)).toEqual([
      "default",
      "red",
      "gameboy",
      "pico8",
      "gray",
      "violet",
    ]);
  });

  it("keeps every preset at two or more valid colors", () => {
    for (const preset of DITHER_PALETTE_PRESETS) {
      expect(preset.colors.length).toBeGreaterThanOrEqual(2);
      for (const [r, g, b] of preset.colors) {
        for (const channel of [r, g, b]) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("pins the classic sizes", () => {
    const byId: Record<string, number> = {};
    for (const preset of DITHER_PALETTE_PRESETS) byId[preset.id] = preset.colors.length;
    expect(byId["gameboy"]).toBe(4);
    expect(byId["pico8"]).toBe(16);
    expect(byId["gray"]).toBe(8);
    expect(byId["violet"]).toBe(8);
  });

  it("keeps the violet ramp dark at the bottom and violet at the top", () => {
    expect(DITHER_VIOLET_RAMP_PALETTE[0]).toEqual([6, 4, 10]);
    expect(DITHER_VIOLET_RAMP_PALETTE.at(-1)).toEqual([183, 157, 249]);
    for (let level = 1; level < DITHER_VIOLET_RAMP_PALETTE.length; level++) {
      expect(DITHER_VIOLET_RAMP_PALETTE[level][2]).toBeGreaterThanOrEqual(
        DITHER_VIOLET_RAMP_PALETTE[level - 1][2]
      );
    }
  });
});

describe("yorha theme", () => {
  it("keeps the Discord palette mapping", () => {
    const yorha = THEMES.find((theme) => theme.name === "yorha");
    expect(yorha?.colors.primary).toBe("#dad4bb");
    expect(yorha?.colors.secondary).toBe("#57544a");
    expect(yorha?.colors.muted).toBe("#979381");
    expect(yorha?.colors.destructive).toBe("#cd664d");
  });

  it("ships the bundled IBM Plex Sans stack", () => {
    const yorha = THEMES.find((theme) => theme.name === "yorha");
    expect(yorha?.fontFamily).toContain("IBM Plex Sans");
  });
});

describe("google theme", () => {
  it("ships the bundled Roboto stack", () => {
    const google = THEMES.find((theme) => theme.name === "google");
    expect(google?.fontFamily).toBe("Roboto");
  });
});

/**
 * Every family a theme is allowed to name: bundled in `public/fonts` with an `@font-face` in
 * `src/index.css`, shipped by Windows, or a CSS generic keyword. Anything else would silently fall
 * back to the app font on a machine that does not happen to have it installed.
 */
const ALLOWED_FAMILIES = new Set([
  "Perfect DOS VGA 437",
  "IBM Plex Sans",
  "Roboto",
  "Inter",
  "MS Sans Serif",
  "Microsoft Sans Serif",
  "Segoe UI",
  "Segoe UI Variable",
  "Tahoma",
  "system-ui",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "ui-sans-serif",
  "ui-monospace",
]);

function familiesOf(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .filter((part) => part.length > 0);
}

it("only names fonts that are bundled or shipped by the OS", () => {
  for (const theme of THEMES) {
    if (!theme.fontFamily) continue;
    for (const family of familiesOf(theme.fontFamily)) {
      expect(ALLOWED_FAMILIES.has(family), `${theme.name} names ${family}`).toBe(true);
    }
  }
});

it("uses Inter for the Apple theme instead of San Francisco", () => {
  // San Francisco is not redistributable, so the theme ships Inter, the closest open equivalent.
  const apple = THEMES.find((theme) => theme.name === "apple");
  expect(apple?.fontFamily).toBe("Inter");
});

function crateVersion(toml: string): string {
  const section = toml.split(/^\[package\]/m)[1] ?? "";
  const match = /^version = "([^"]+)"$/m.exec(section.split(/^\[/m)[0] ?? "");
  if (!match) throw new Error("iluhaAnime crate version not found");
  return match[1];
}

describe("release versions", () => {
  it("keeps package.json, tauri.conf.json, and Cargo.toml on the same version", () => {
    expect(tauriConf.version).toBe(packageJson.version);
    expect(crateVersion(cargoToml)).toBe(packageJson.version);
  });

  it("uses a plain semver release version", () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

function cspImgSrc(): string {
  const csp = tauriConf.app.security.csp;
  const match = /(?:^|;)\s*img-src\s+([^;]*)/.exec(csp);
  if (!match) throw new Error("iluhaAnime CSP has no img-src directive");
  return match[1] ?? "";
}

describe("tauri content security", () => {
  it("allows blob: images so locally picked files decode in the production build", () => {
    expect(cspImgSrc().split(/\s+/)).toContain("blob:");
  });
});
