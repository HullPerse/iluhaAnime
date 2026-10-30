import type { AniListSort } from "@/types/anilist/anilist";

export const ANILIST_SCROLL_HEADER_ESTIMATE = 24;
export const ANILIST_SCROLL_ROW_ESTIMATE = 144;

export const listSortKeys: AniListSort["key"][] = [
  "title",
  "score",
  "myScore",
  "progress",
  "completed",
  "release",
  "status",
];

export const defaultListSortDir: Record<AniListSort["key"], AniListSort["dir"]> = {
  title: "asc",
  score: "desc",
  myScore: "desc",
  progress: "desc",
  completed: "desc",
  release: "desc",
  status: "asc",
};
