import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type {
  CompareDiffKind,
  CompareMetric,
  CompareSort,
  CompareVerdict,
} from "@/types/core/compare";
import { COMPARE_SORTS } from "@/lib/core/compare.utils";

export type CompareTab = "shared" | "mine" | "friend";

export const TAB_KEYS: Record<"shared" | "mine", TranslationKey> = {
  shared: "anilist.compare.shared",
  mine: "anilist.compare.only.mine",
};

export const SORT_KEYS: Record<CompareSort, TranslationKey> = {
  gap: "anilist.compare.sort.gap",
  close: "anilist.compare.sort.close",
  title: "anilist.compare.sort.title",
  mine: "anilist.compare.sort.mine",
  friend: "anilist.compare.sort.friend",
};

export const SORTS_BY_TAB: Record<CompareTab, readonly CompareSort[]> = {
  shared: COMPARE_SORTS,
  mine: ["title", "mine"],
  friend: ["title", "friend"],
};

export const VERDICT_KEYS: Record<CompareVerdict, TranslationKey> = {
  identical: "anilist.compare.verdict.identical",
  close: "anilist.compare.verdict.close",
  mixed: "anilist.compare.verdict.mixed",
  opposite: "anilist.compare.verdict.opposite",
  unknown: "anilist.compare.verdict.unknown",
};

export const CONFIDENCE_KEYS: Record<"medium" | "high", TranslationKey> = {
  medium: "anilist.compare.confidence.medium",
  high: "anilist.compare.confidence.high",
};

export const METRIC_KEYS: Record<CompareMetric, TranslationKey> = {
  delta: "anilist.compare.metric.delta",
  iluha: "anilist.compare.metric.iluha",
  mal: "anilist.compare.metric.mal",
};

export const DIFF_SYMBOL: Record<CompareDiffKind, string> = {
  same: "=",
  close: "~",
  far: "!",
  unknown: "",
};

export const DIFF_CLASS: Record<CompareDiffKind, string> = {
  same: "text-hint",
  close: "text-success",
  far: "text-destructive",
  unknown: "text-hint",
};

export const DIFF_BORDER: Record<CompareDiffKind, string> = {
  same: "border-l-hint",
  close: "border-l-success",
  far: "border-l-destructive",
  unknown: "border-l-transparent",
};
