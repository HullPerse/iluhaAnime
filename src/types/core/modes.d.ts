import type { PlayerModeId } from "@/types/player/videoPlayer";
import type { TranslationKey } from "@/types/core/i18n";

export interface PlayerModeDef {
  id: PlayerModeId;
  labelKey: TranslationKey;
  shader: string | null;
  params: Record<string, number>;
  curvatureEditable: boolean;
}
