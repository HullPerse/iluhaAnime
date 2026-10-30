import type { TranslationKey } from "@/types/core/i18n";

export type AnilistScoreFormat =
  | "POINT_100"
  | "POINT_10_DECIMAL"
  | "POINT_10"
  | "POINT_5"
  | "POINT_3";

export type ScoreIcon = "star" | "frown" | "meh" | "smile";

export interface ValidatedScore {
  value: number | null;
  error: TranslationKey | null;
}
