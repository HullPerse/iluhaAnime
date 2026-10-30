import { describe, expect, it } from "vitest";

import { buildModeCommands, formatShaderOpts, playerModeParams } from "@/lib/core/crt.utils";

const CRT_PATH = "C:/app/shaders/crt-tv.glsl";
const VHS_PATH = "C:/app/shaders/vhs.glsl";

const crt = { shader: "crt-tv", path: CRT_PATH };

function tvTarget(curvature: 0.02 | 0.04 | 0.07 = 0.04) {
  return { shader: "crt-tv", path: CRT_PATH, params: playerModeParams("tv", curvature) };
}

describe("playerModeParams", () => {
  it("uses the player curvature for the bending modes", () => {
    expect(playerModeParams("tv", 0.07).curvature).toBe(0.07);
    expect(playerModeParams("mono", 0.02).curvature).toBe(0.02);
  });

  it("keeps the fixed parameters of the other modes", () => {
    expect(playerModeParams("monitor", 0.07).curvature).toBe(0);
    expect(playerModeParams("vhs", 0.07).curvature).toBeUndefined();
    expect(playerModeParams("vhs", 0.07).noise).toBe(0.12);
    expect(playerModeParams("normal", 0.07)).toEqual({});
  });
});

describe("formatShaderOpts", () => {
  it("writes the whole key-value list in one string", () => {
    expect(formatShaderOpts("crt-tv", playerModeParams("tv", 0.04))).toBe(
      "crt-tv/curvature=0.04,crt-tv/scanline=0.6,crt-tv/mask=0.35,crt-tv/mono=0,crt-tv/tint=0"
    );
  });
});

describe("buildModeCommands", () => {
  it("does nothing when the screen is already normal", () => {
    expect(buildModeCommands(null, { shader: null, path: null, params: {} })).toEqual([]);
  });

  it("removes the active shader when switching to normal", () => {
    expect(buildModeCommands(crt, { shader: null, path: null, params: {} })).toEqual([
      { name: "change-list", args: ["glsl-shaders", "remove", CRT_PATH] },
    ]);
  });

  it("applies options before loading the shader", () => {
    expect(buildModeCommands(null, tvTarget())).toEqual([
      {
        name: "set",
        args: [
          "glsl-shader-opts",
          "crt-tv/curvature=0.04,crt-tv/scanline=0.6,crt-tv/mask=0.35,crt-tv/mono=0,crt-tv/tint=0",
        ],
      },
      { name: "change-list", args: ["glsl-shaders", "append", CRT_PATH] },
    ]);
  });

  it("reloads the same shader so a paused picture picks up new options", () => {
    expect(buildModeCommands(crt, tvTarget(0.07))).toEqual([
      {
        name: "set",
        args: [
          "glsl-shader-opts",
          "crt-tv/curvature=0.07,crt-tv/scanline=0.6,crt-tv/mask=0.35,crt-tv/mono=0,crt-tv/tint=0",
        ],
      },
      { name: "change-list", args: ["glsl-shaders", "remove", CRT_PATH] },
      { name: "change-list", args: ["glsl-shaders", "append", CRT_PATH] },
    ]);
  });

  it("swaps the shader when the mode changes family", () => {
    const commands = buildModeCommands(crt, {
      shader: "vhs",
      path: VHS_PATH,
      params: playerModeParams("vhs", 0.04),
    });
    expect(commands[0].args[0]).toBe("glsl-shader-opts");
    expect(commands[1]).toEqual({
      name: "change-list",
      args: ["glsl-shaders", "remove", CRT_PATH],
    });
    expect(commands[2]).toEqual({
      name: "change-list",
      args: ["glsl-shaders", "append", VHS_PATH],
    });
  });
});
