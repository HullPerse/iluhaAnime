import type { DailyMode } from "@/types/api/daily";
import type { TranslationKey } from "@/types/core/i18n";

export const MAX_DAILY_FRAMES = 6;

export const DAILY_MODE_LABEL_KEYS: Record<DailyMode, TranslationKey> = {
  frames: "collection.game.mode.frames",
  op: "collection.game.mode.op",
  audio: "collection.game.mode.audio",
};

export const DAILY_HINT_KEYS: Record<string, TranslationKey> = {
  year: "collection.game.hint.year",
  format: "collection.game.hint.format",
  episodes: "collection.game.hint.episodes",
  studio: "collection.game.hint.studio",
  genres: "collection.game.hint.genres",
  score: "collection.game.hint.score",
  source: "collection.game.hint.source",
};
