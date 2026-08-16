// Label maps hold i18n keys; UI renders them through translate().
export const RELATION_LABEL: Record<string, string> = {
  ADAPTATION: "anilist.relation.ADAPTATION",
  ALTERNATIVE: "anilist.relation.ALTERNATIVE",
  CHARACTER: "anilist.relation.CHARACTER",
  CONTAINS: "anilist.relation.CONTAINS",
  OTHER: "anilist.relation.OTHER",
  PARENT: "anilist.relation.PARENT",
  PREQUEL: "anilist.relation.PREQUEL",
  SEQUEL: "anilist.relation.SEQUEL",
  SIDE_STORY: "anilist.relation.SIDE_STORY",
  SOURCE: "anilist.relation.SOURCE",
  SPIN_OFF: "anilist.relation.SPIN_OFF",
  SUMMARY: "anilist.relation.SUMMARY",
};

export const SUPPORTED_RELATION_TYPES = new Set(["ANIME"]);

export const NODE_W = 70;
export const NODE_H = 95;
export const IMG_H = 80;

export const RELATION_FILTERS = [
  "SEQUEL",
  "PREQUEL",
  "SIDE_STORY",
  "SPIN_OFF",
  "OTHER",
] as const;

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

export const EDGE_STYLES: Record<
  string,
  { color: string; dash: string; width: number }
> = {
  ADAPTATION: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  ALTERNATIVE: { color: "#95a5a6", dash: "4,4", width: 0.75 },
  CHARACTER: { color: "#95a5a6", dash: "4,4", width: 0.75 },
  CONTAINS: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  OTHER: { color: "#bdc3c7", dash: "3,3", width: 0.75 },
  PARENT: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  PREQUEL: { color: "#d97a30", dash: "", width: 1.5 },
  SEQUEL: { color: "#4a90d9", dash: "", width: 1.5 },
  SIDE_STORY: { color: "#5a9e6f", dash: "5,3", width: 1 },
  SOURCE: { color: "#7f8c8d", dash: "4,3", width: 0.75 },
  SPIN_OFF: { color: "#8e5ea2", dash: "4,4", width: 1 },
  SUMMARY: { color: "#95a5a6", dash: "5,3", width: 0.75 },
  UNKNOWN: { color: "#bdc3c7", dash: "3,3", width: 0.75 },
};

export const NODE_BORDER_COLORS: Record<string, string> = {
  ADAPTATION: "#7f8c8d",
  ALTERNATIVE: "#95a5a6",
  CHARACTER: "#95a5a6",
  CONTAINS: "#7f8c8d",
  OTHER: "#bdc3c7",
  PARENT: "#7f8c8d",
  PREQUEL: "#d97a30",
  SEQUEL: "#4a90d9",
  SIDE_STORY: "#5a9e6f",
  SOURCE: "#7f8c8d",
  SPIN_OFF: "#8e5ea2",
  SUMMARY: "#95a5a6",
  UNKNOWN: "#bdc3c7",
};

export const FILTER_LABELS: Record<string, string> = {
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

export const statusLabels: Record<string, string> = {
  CANCELLED: "anilist.status.CANCELLED",
  FINISHED: "anilist.status.FINISHED",
  HIATUS: "anilist.status.HIATUS",
  NOT_YET_RELEASED: "anilist.status.NOT_YET_RELEASED",
  RELEASING: "anilist.status.RELEASING",
};

export const formatLabels: Record<string, string> = {
  MOVIE: "anilist.format.MOVIE",
  MUSIC: "anilist.format.MUSIC",
  ONA: "anilist.format.ONA",
  OVA: "anilist.format.OVA",
  SPECIAL: "anilist.format.SPECIAL",
  TV: "anilist.format.TV",
  TV_SHORT: "anilist.format.TV_SHORT",
};

export const seasonLabels: Record<string, string> = {
  FALL: "anilist.season.FALL",
  SPRING: "anilist.season.SPRING",
  SUMMER: "anilist.season.SUMMER",
  WINTER: "anilist.season.WINTER",
};

export const listStatusLabels: Record<string, string> = {
  COMPLETED: "anilist.listStatus.COMPLETED",
  CURRENT: "anilist.listStatus.CURRENT",
  DROPPED: "anilist.listStatus.DROPPED",
  PAUSED: "anilist.listStatus.PAUSED",
  PLANNING: "anilist.listStatus.PLANNING",
  REPEATING: "anilist.listStatus.REPEATING",
  WATCHING: "anilist.listStatus.WATCHING",
};

const listStatusOrder = [
  "CURRENT",
  "COMPLETED",
  "DROPPED",
  "PAUSED",
  "PLANNING",
  "REPEATING",
  "WATCHING",
] as const;

export const listStatusOptions = listStatusOrder.map((value) => ({
  label: listStatusLabels[value],
  value,
}));
