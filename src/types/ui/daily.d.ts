import type { AniMedia } from "@/types/anilist/anilist";

export interface GuessHistoryItem {
  media: AniMedia;
  correct: boolean;
  franchise: boolean;
}
