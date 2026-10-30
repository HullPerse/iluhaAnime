import type { PlayerModeId } from "@/types/videoPlayer";
import type { TranslationKey } from "@/types/i18n";

export interface PlayerModeDef {
  id: PlayerModeId;
  labelKey: TranslationKey;
  /** Shader base name used by glsl-shader-opts; null turns the effect off. */
  shader: string | null;
  params: Record<string, number>;
  /** Curvature comes from the player setting instead of the fixed params. */
  curvatureEditable: boolean;
}
