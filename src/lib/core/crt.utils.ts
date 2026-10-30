import { PLAYER_MODES } from "@/config/settings/modes.config";
import type { CrtCurvature, PlayerModeId } from "@/types/player/videoPlayer";
import type { ActivePlayerShader, MpvCommand, PlayerShaderTarget } from "@/types/core/crt";

/** Parameters for a mode, with the player curvature replacing the fixed one. */
export function playerModeParams(
  mode: PlayerModeId,
  curvature: CrtCurvature
): Record<string, number> {
  const def = PLAYER_MODES[mode];
  if (def.shader === null) return {};
  const params = { ...def.params };
  if (def.curvatureEditable) params.curvature = curvature;
  return params;
}

/** mpv key-value list form: shader/param=value,shader/param=value. */
export function formatShaderOpts(shader: string, params: Record<string, number>): string {
  return Object.entries(params)
    .map(([name, value]) => `${shader}/${name}=${value}`)
    .join(",");
}

/**
 * Commands that move mpv from the active shader to the target one. A shader
 * swap re-appends the file so a paused picture re-renders with the new opts.
 */
export function buildModeCommands(
  active: ActivePlayerShader | null,
  target: PlayerShaderTarget
): MpvCommand[] {
  if (target.shader === null || target.path === null) {
    return active === null
      ? []
      : [{ name: "change-list", args: ["glsl-shaders", "remove", active.path] }];
  }

  const commands: MpvCommand[] = [
    {
      name: "set",
      args: ["glsl-shader-opts", formatShaderOpts(target.shader, target.params)],
    },
  ];

  if (active?.shader === target.shader) {
    commands.push({ name: "change-list", args: ["glsl-shaders", "remove", target.path] });
  } else if (active !== null) {
    commands.push({ name: "change-list", args: ["glsl-shaders", "remove", active.path] });
  }

  commands.push({ name: "change-list", args: ["glsl-shaders", "append", target.path] });
  return commands;
}
