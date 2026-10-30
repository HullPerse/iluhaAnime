import type { MpvChapter } from "@/types/player/videoPlayer";

export interface ActiveChapter {
  chapter: MpvChapter;
  index: number;
  target: number;
}

export interface SkipTarget {
  target: number;
  nextEpisode: boolean;
}
