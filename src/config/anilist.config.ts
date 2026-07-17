export const RELATION_LABEL: Record<string, string> = {
  SEQUEL: "Сиквел",
  PREQUEL: "Приквел",
  ADAPTATION: "Адаптация",
  SIDE_STORY: "Сайд-стори",
  CHARACTER: "Персонаж",
  SUMMARY: "Сводка",
  ALTERNATIVE: "Альтернатива",
  SPIN_OFF: "Спин-офф",
  PARENT: "Родительская",
  CONTAINS: "Содержит",
  SOURCE: "Источник",
  OTHER: "Другое",
};

export const NODE_W = 70;
export const NODE_H = 95;
export const IMG_H = 80;
export const CACHE_VER = "v4";

export const RELATION_FILTERS = [
  "SEQUEL",
  "PREQUEL",
  "SIDE_STORY",
  "SPIN_OFF",
] as const;

export const FILTER_GROUPS: Record<string, string[]> = {
  SEQUEL: ["SEQUEL"],
  PREQUEL: ["PREQUEL"],
  SIDE_STORY: ["SIDE_STORY"],
  SPIN_OFF: ["SPIN_OFF"],
  OTHER: [
    "ADAPTATION",
    "PARENT",
    "CONTAINS",
    "SOURCE",
    "SUMMARY",
    "ALTERNATIVE",
    "CHARACTER",
    "UNKNOWN",
  ],
};

export const EDGE_STYLES: Record<
  string,
  { color: string; dash: string; width: number }
> = {
  SEQUEL: { color: "#4a90d9", dash: "", width: 1.5 },
  PREQUEL: { color: "#d97a30", dash: "", width: 1.5 },
  SIDE_STORY: { color: "#5a9e6f", dash: "5,3", width: 1 },
  SPIN_OFF: { color: "#8e5ea2", dash: "4,4", width: 1 },
  ADAPTATION: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  PARENT: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  CONTAINS: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  SOURCE: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  SUMMARY: { color: "#95a5a6", dash: "5,3", width: 0.75 },
  ALTERNATIVE: { color: "#95a5a6", dash: "4,4", width: 0.75 },
  CHARACTER: { color: "#95a5a6", dash: "4,4", width: 0.75 },
  OTHER: { color: "#bdc3c7", dash: "3,3", width: 0.75 },
  UNKNOWN: { color: "#bdc3c7", dash: "3,3", width: 0.75 },
};

export const FILTER_LABELS: Record<string, string> = {
  SEQUEL: "Сиквелы",
  PREQUEL: "Приквелы",
  SIDE_STORY: "Сайд-стори",
  SPIN_OFF: "Спин-офф",
  OTHER: "Другое",
};

export const RELATION_X: Record<string, number> = {
  SEQUEL: 0.75,
  PREQUEL: 0.25,
  SIDE_STORY: 0.65,
  SPIN_OFF: 0.35,
  ADAPTATION: 0.5,
  PARENT: 0.5,
  CONTAINS: 0.5,
  SOURCE: 0.5,
  SUMMARY: 0.5,
  ALTERNATIVE: 0.5,
  CHARACTER: 0.5,
  OTHER: 0.5,
  UNKNOWN: 0.5,
};
