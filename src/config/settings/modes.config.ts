import * as z from "zod/mini";

import { keysOf } from "@/lib/core/hotkeys/keysOf.utils";
import type { TranslationKey } from "@/types/core/i18n";
import type { CrtCurvature, PlayerCabinetId, PlayerModeId } from "@/types/player/videoPlayer";
import type { PlayerModeDef } from "@/types/core/modes";
import data from "./modes.data.json";

const PlayerModeDefSchema = z.object({
  id: z.string(),
  labelKey: z.string(),
  shader: z.nullable(z.string()),
  params: z.record(z.string(), z.number()),
  curvatureEditable: z.boolean(),
});

const ModesDataSchema = z.object({
  playerModes: z.record(z.string(), PlayerModeDefSchema),
  playerCabinets: z.record(z.string(), z.string()),
  crtCurvatures: z.array(z.union([z.literal(0.02), z.literal(0.04), z.literal(0.07)])),
  crtCurvatureLabels: z.record(z.string(), z.string()),
});

const parsed = ModesDataSchema.parse(data);

export const PLAYER_MODES = parsed.playerModes as Record<PlayerModeId, PlayerModeDef>;
export const PLAYER_MODE_IDS = keysOf(PLAYER_MODES);
export const PLAYER_CABINETS = parsed.playerCabinets as Record<PlayerCabinetId, TranslationKey>;
export const PLAYER_CABINET_IDS = keysOf(PLAYER_CABINETS);
export const CRT_CURVATURES = parsed.crtCurvatures as readonly CrtCurvature[];
export const CRT_CURVATURE_LABELS = parsed.crtCurvatureLabels as Record<CrtCurvature, TranslationKey>;