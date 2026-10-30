import { describe, expect, it } from "vitest";

import {
  CRT_CURVATURES,
  PLAYER_CABINETS,
  PLAYER_MODE_IDS,
  PLAYER_MODES,
} from "@/config/modes.config";

describe("player screen modes", () => {
  it("keeps one definition per id", () => {
    expect(PLAYER_MODE_IDS).toHaveLength(5);
    for (const id of PLAYER_MODE_IDS) {
      expect(PLAYER_MODES[id].id).toBe(id);
    }
  });

  it("turns the effect off only in the normal mode", () => {
    for (const id of PLAYER_MODE_IDS) {
      const def = PLAYER_MODES[id];
      if (id === "normal") {
        expect(def.shader).toBeNull();
        expect(def.params).toEqual({});
      } else {
        expect(def.shader).not.toBeNull();
        expect(Object.keys(def.params).length).toBeGreaterThan(0);
      }
    }
  });

  it("bends only the modes with an editable curvature", () => {
    const editable = PLAYER_MODE_IDS.filter((id) => PLAYER_MODES[id].curvatureEditable);
    expect(editable).toEqual(["tv", "mono"]);
  });

  it("references only shaders the backend resolves", () => {
    const shaders = new Set(
      PLAYER_MODE_IDS.map((id) => PLAYER_MODES[id].shader).filter((id) => id !== null)
    );
    expect([...shaders].sort()).toEqual(["crt-tv", "vhs"]);
  });

  it("offers three curvature steps and an off switch before the cabinets", () => {
    expect(CRT_CURVATURES).toEqual([0.02, 0.04, 0.07]);
    expect(Object.keys(PLAYER_CABINETS)).toEqual(["none", "win95", "wood"]);
  });
});
