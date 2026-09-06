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
  COMPLETED: "anilist.list.status.COMPLETED",
  CURRENT: "anilist.list.status.CURRENT",
  DROPPED: "anilist.list.status.DROPPED",
  PAUSED: "anilist.list.status.PAUSED",
  PLANNING: "anilist.list.status.PLANNING",
  REPEATING: "anilist.list.status.REPEATING",
  WATCHING: "anilist.list.status.WATCHING",
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
