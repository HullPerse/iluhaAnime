import type { SpotlightKind } from "@/types/anilist";
import type { TranslationKey } from "@/types/i18n";

export const SPOTLIGHT_KINDS: SpotlightKind[] = ["day", "week", "month"];

export const SPOTLIGHT_LABELS: Record<SpotlightKind, TranslationKey> = {
  day: "anilist.spotlight.day",
  week: "anilist.spotlight.week",
  month: "anilist.spotlight.month",
};

export const SPOTLIGHT_REFRESH_TICK_MS = 60_000;
