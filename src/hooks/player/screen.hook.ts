import { useEffect, useRef } from "react";

import { PLAYER_MODES } from "@/config/settings/modes.config";
import { buildModeCommands, playerModeParams } from "@/lib/core/crt.utils";
import type { ActivePlayerShader } from "@/types/core/crt";
import { playerShaderPath, runPlayerCommand } from "@/lib/player/playback.utils";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import type { PlayerBezelVariant, PlayerSettings } from "@/types/player/videoPlayer";

/**
 * Applies the selected screen mode to mpv and returns the cabinet variant to
 * draw, or null when the cabinet is off. Both are picture settings, so they
 * stay in every view preset and in fullscreen. The shader path is resolved
 * once per bundled shader.
 */
export function usePlayerScreen(
  ready: boolean,
  settings: PlayerSettings,
  hasFile: boolean
): PlayerBezelVariant | null {
  const activeShaderRef = useRef<ActivePlayerShader | null>(null);
  const shaderPathsRef = useRef<Map<string, string>>(new Map());
  const epochRef = useRef<number>(0);
  const mode = settings.playerMode;

  useEffect(() => {
    if (!ready) return;
    const def = PLAYER_MODES[mode];
    const epoch = ++epochRef.current;

    const resolvePath = async (id: string): Promise<string> => {
      const cached = shaderPathsRef.current.get(id);
      if (cached !== undefined) return cached;
      const path = await playerShaderPath(id);
      shaderPathsRef.current.set(id, path);
      return path;
    };

    const apply = async () => {
      const path = def.shader === null ? null : await resolvePath(def.shader);
      if (epoch !== epochRef.current) return;
      const commands = buildModeCommands(activeShaderRef.current, {
        shader: def.shader,
        path,
        params: playerModeParams(mode, settings.crtCurvature),
      });
      for (const command of commands) {
        await runPlayerCommand(command.name, command.args);
        if (epoch !== epochRef.current) return;
      }
      activeShaderRef.current =
        def.shader !== null && path !== null ? { shader: def.shader, path } : null;
    };

    apply().catch((error: unknown) => {
      reportBackgroundError("player.settings.shader", error);
    });
  }, [ready, mode, settings.crtCurvature]);

  return hasFile && settings.cabinet !== "none" ? settings.cabinet : null;
}
