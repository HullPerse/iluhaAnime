import type { TranslationKey } from "@/types/i18n";

export const NODE_W = 70;
export const NODE_H = 95;
export const IMG_H = 80;

export const FRANCHISE_VIEWPORT = {
  initialScale: 0.4,
  maxScale: 5,
  minScale: 0.1,
  wheelStep: 0.1,
} as const;

export const RELATION_FILTERS = ["SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF", "OTHER"] as const;

export const FILTER_GROUPS: Record<string, string[]> = {
  OTHER: [
    "ADAPTATION",
    "PARENT",
    "CONTAINS",
    "SOURCE",
    "SUMMARY",
    "ALTERNATIVE",
    "CHARACTER",
    "OTHER",
    "UNKNOWN",
  ],
  PREQUEL: ["PREQUEL"],
  SEQUEL: ["SEQUEL"],
  SIDE_STORY: ["SIDE_STORY"],
  SPIN_OFF: ["SPIN_OFF"],
};

export const EDGE_STYLES: Record<string, { color: string; dash: string; width: number }> = {
  ADAPTATION: { color: "var(--color-graph-default)", dash: "4,3", width: 0.75 },
  ALTERNATIVE: { color: "var(--color-graph-light)", dash: "4,4", width: 0.75 },
  CHARACTER: { color: "var(--color-graph-light)", dash: "4,4", width: 0.75 },
  CONTAINS: { color: "var(--color-graph-default)", dash: "4,3", width: 0.75 },
  OTHER: { color: "var(--color-graph-pale)", dash: "3,3", width: 0.75 },
  PARENT: { color: "var(--color-graph-default)", dash: "4,3", width: 0.75 },
  PREQUEL: { color: "var(--color-graph-prequel)", dash: "", width: 1.5 },
  SEQUEL: { color: "var(--color-graph-sequel)", dash: "", width: 1.5 },
  SIDE_STORY: { color: "var(--color-graph-side)", dash: "5,3", width: 1 },
  SOURCE: { color: "var(--color-graph-default)", dash: "4,3", width: 0.75 },
  SPIN_OFF: { color: "var(--color-graph-spinoff)", dash: "4,4", width: 1 },
  SUMMARY: { color: "var(--color-graph-light)", dash: "5,3", width: 0.75 },
  UNKNOWN: { color: "var(--color-graph-pale)", dash: "3,3", width: 0.75 },
};

export const NODE_BORDER_COLORS: Record<string, string> = {
  ADAPTATION: "var(--color-graph-default)",
  ALTERNATIVE: "var(--color-graph-light)",
  CHARACTER: "var(--color-graph-light)",
  CONTAINS: "var(--color-graph-default)",
  OTHER: "var(--color-graph-pale)",
  PARENT: "var(--color-graph-default)",
  PREQUEL: "var(--color-graph-prequel)",
  SEQUEL: "var(--color-graph-sequel)",
  SIDE_STORY: "var(--color-graph-side)",
  SOURCE: "var(--color-graph-default)",
  SPIN_OFF: "var(--color-graph-spinoff)",
  SUMMARY: "var(--color-graph-light)",
  UNKNOWN: "var(--color-graph-pale)",
};

export const FILTER_LABELS: Record<string, TranslationKey> = {
  OTHER: "anilist.filter.OTHER",
  PREQUEL: "anilist.filter.PREQUEL",
  SEQUEL: "anilist.filter.SEQUEL",
  SIDE_STORY: "anilist.filter.SIDE_STORY",
  SPIN_OFF: "anilist.filter.SPIN_OFF",
};

export const RELATION_X: Record<string, number> = {
  ADAPTATION: 0.5,
  ALTERNATIVE: 0.5,
  CHARACTER: 0.5,
  CONTAINS: 0.5,
  OTHER: 0.5,
  PARENT: 0.5,
  PREQUEL: 0.25,
  SEQUEL: 0.75,
  SIDE_STORY: 0.65,
  SOURCE: 0.5,
  SPIN_OFF: 0.35,
  SUMMARY: 0.5,
  UNKNOWN: 0.5,
};

export const FORMAT_SHORT: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TVS",
  MOVIE: "MOV",
  SPECIAL: "SP",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "MV",
};
