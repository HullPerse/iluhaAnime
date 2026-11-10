import * as z from "zod/mini";

import { keysOf } from "@/lib/core/hotkeys/keysOf.utils";
import type { PlayerProfile, PlayerProfileId } from "@/types/player/videoPlayer";
import data from "./profiles.data.json";

const PlayerProfileSchema = z.object({
  id: z.string(),
  labelKey: z.string(),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

const ProfilesDataSchema = z.object({
  PLAYER_PROFILES: z.record(z.string(), PlayerProfileSchema),
});

const parsed = ProfilesDataSchema.parse(data);

export const PLAYER_PROFILES = parsed.PLAYER_PROFILES as Record<PlayerProfileId, PlayerProfile>;
export const PLAYER_PROFILE_IDS = keysOf(PLAYER_PROFILES);
