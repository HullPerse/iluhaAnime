import type { PlayerProfile, PlayerProfileId } from "@/types/videoPlayer";

export const PLAYER_PROFILES: Record<PlayerProfileId, PlayerProfile> = {
  basic: {
    id: "basic",
    labelKey: "player.media.settings.profile.basic",
    options: {
      "demuxer-readahead-secs": 1,
    },
  },
  speed: {
    id: "speed",
    labelKey: "player.media.settings.profile.speed",
    options: {
      "demuxer-readahead-secs": 0.5,
    },
  },
  quality: {
    id: "quality",
    labelKey: "player.media.settings.profile.quality",
    options: {
      "demuxer-readahead-secs": 10,
    },
  },
};

export const PLAYER_PROFILE_IDS = Object.keys(PLAYER_PROFILES) as PlayerProfileId[];
