import type { TranslationKey } from "@/types/i18n";

export type AnilistScoreFormat =
  | "POINT_100"
  | "POINT_10_DECIMAL"
  | "POINT_10"
  | "POINT_5"
  | "POINT_3";

export const DEFAULT_SCORE_FORMAT: AnilistScoreFormat = "POINT_10";

const KNOWN_FORMATS: readonly AnilistScoreFormat[] = [
  "POINT_100",
  "POINT_10_DECIMAL",
  "POINT_10",
  "POINT_5",
  "POINT_3",
];

export function parseScoreFormat(value: unknown): AnilistScoreFormat {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if ((KNOWN_FORMATS as readonly string[]).includes(upper)) return upper as AnilistScoreFormat;
  }
  return DEFAULT_SCORE_FORMAT;
}

export function resolveDisplayScoreFormat(
  mode: string,
  friendFormat: unknown,
  userFormat: unknown
): AnilistScoreFormat {
  if (mode === "friend") {
    return parseScoreFormat(friendFormat);
  }
  return parseScoreFormat(userFormat);
}

const SCORE_MAX: Record<AnilistScoreFormat, number> = {
  POINT_100: 100,
  POINT_10_DECIMAL: 10,
  POINT_10: 10,
  POINT_5: 5,
  POINT_3: 3,
};

export function scoreFormatMax(format: AnilistScoreFormat): number {
  return SCORE_MAX[format];
}

const SCORE_SUFFIX: Record<AnilistScoreFormat, string> = {
  POINT_100: "/100",
  POINT_10_DECIMAL: "/10",
  POINT_10: "/10",
  POINT_5: "/5",
  POINT_3: "",
};

export function scoreFormatSuffix(format: AnilistScoreFormat): string {
  return SCORE_SUFFIX[format];
}

export function usesNumericInput(format: AnilistScoreFormat): boolean {
  return format === "POINT_100" || format === "POINT_10_DECIMAL";
}

export function numericInputStep(format: AnilistScoreFormat): string {
  return format === "POINT_10_DECIMAL" ? "0.1" : "1";
}

export function scoreOptions(format: AnilistScoreFormat): Array<{ value: string; label: string }> {
  const none = [{ value: "", label: "-" }];
  if (format === "POINT_10") {
    return [
      ...none,
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) })),
    ];
  }
  if (format === "POINT_5") {
    return [...none, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))];
  }
  if (format === "POINT_3") {
    return [
      ...none,
      { value: "1", label: ":(" },
      { value: "2", label: ":|" },
      { value: "3", label: ":)" },
    ];
  }
  return [];
}

const SMILEYS: Record<number, string> = {
  1: ":(",
  2: ":|",
  3: ":)",
};

export function smileyForScore(score: number | null | undefined): string | null {
  if (score == null || score === 0) return null;
  return SMILEYS[score] ?? null;
}

export type ScoreIcon = "star" | "frown" | "meh" | "smile";

export function scoreIconFor(
  format: AnilistScoreFormat,
  score: number | null | undefined
): ScoreIcon {
  if (format === "POINT_3") {
    if (score === 1) return "frown";
    if (score === 2) return "meh";
    if (score === 3) return "smile";
    return "meh";
  }
  return "star";
}

export function formatScore(score: number | null | undefined, format: AnilistScoreFormat): string {
  if (score == null || score === 0) return "-";
  if (format === "POINT_3") return smileyForScore(score) ?? "-";
  return `${score}${scoreFormatSuffix(format)}`;
}

export function formatEntryScore(
  score: number | null | undefined,
  format: AnilistScoreFormat
): string | null {
  if (score == null || score === 0) return null;
  return formatScore(score, format);
}

export function normalizeToTen(
  score: number | null | undefined,
  format: AnilistScoreFormat
): number | null {
  if (score == null || score === 0) return null;
  if (format === "POINT_100") {
    return score / 10;
  }
  if (format === "POINT_5") {
    return score * 2;
  }
  if (format === "POINT_3") {
    return Math.round((score * 10) / 3);
  }
  return score;
}

const SCORE_FORMAT_ERROR: Record<AnilistScoreFormat, TranslationKey> = {
  POINT_100: "anilist.controls.score.need.int.100",
  POINT_10_DECIMAL: "anilist.controls.score.need.decimal.10",
  POINT_10: "anilist.controls.score.need.int.10",
  POINT_5: "anilist.controls.score.need.int.5",
  POINT_3: "anilist.controls.score.need.int.3",
};

export interface ValidatedScore {
  value: number | null;
  error: TranslationKey | null;
}

export function validateScoreInput(raw: string, format: AnilistScoreFormat): ValidatedScore {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, error: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { value: null, error: "anilist.controls.score.need.number" };
  const max = scoreFormatMax(format);
  const formatError = SCORE_FORMAT_ERROR[format];
  if (value < 0 || value > max) return { value: null, error: formatError };
  if (format === "POINT_10_DECIMAL") {
    const rounded = Math.round(value * 10) / 10;
    if (Math.abs(rounded - value) > 1e-9) return { value: null, error: formatError };
    return { value, error: null };
  }
  if (!Number.isInteger(value)) return { value: null, error: formatError };
  return { value, error: null };
}

/**
 * AniList does not document the scale of `UserStatistics.meanScore`, so a value above the
 * maximum of the user's own score format can only have come back on the canonical 0-100
 * scale and is converted; anything else is taken at face value.
 */
export function formatMeanScore(
  meanScore: number | null | undefined,
  format: AnilistScoreFormat
): string | null {
  if (meanScore == null || meanScore === 0) return null;
  const max = scoreFormatMax(format);
  const score = meanScore > max ? (meanScore * max) / 100 : meanScore;
  const rounded = Math.round(score * 10) / 10;
  return `${rounded}${scoreFormatSuffix(format) || `/${max}`}`;
}
