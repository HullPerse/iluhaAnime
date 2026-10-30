export type CompareMetric = "iluha" | "mal" | "delta";

export type CompareConfidence = "none" | "low" | "medium" | "high";

export type CompareVerdict = "identical" | "close" | "mixed" | "opposite" | "unknown";

export type CompareDiffKind = "same" | "close" | "far" | "unknown";

export type CompareSort = "gap" | "close" | "title" | "mine" | "friend";

export interface TasteMatch {
  score: number | null;
  gapScore: number | null;
  rankScore: number | null;
  directionScore: number | null;
  spearman: number | null;
  confidence: CompareConfidence;
  scoredCount: number;
  agree: number;
  split: number;
  neutral: number;
}

export interface ComparedTitle {
  id: number;
  title: string;
  titles: string[];
  coverUrl: string | null;
  episodes: number | null;
  mine: number | null;
  mineRaw: number | null;
  friend: number | null;
  friendRaw: number | null;
  delta: number | null;
  signedDelta: number | null;
  myStatus: string;
  friendStatus: string;
  myProgress: number | null;
  friendProgress: number | null;
}

export interface CompareSummary {
  shared: ComparedTitle[];
  onlyMine: ComparedTitle[];
  onlyFriend: ComparedTitle[];
  sharedScoredCount: number;
  meanDelta: number | null;
  pearson: number | null;
  malAffinity: number | null;
  deltaScore: number | null;
  iluhaAffinity: number | null;
  lowConfidence: boolean;
  libraryOverlap: number | null;
  taste: TasteMatch;
}

export interface GenreOverlap {
  genre: string;
  mine: number;
  friend: number;
}

export interface GenreTaste {
  genre: string;
  mine: number;
  friend: number;
  mineCount: number;
  friendCount: number;
  delta: number;
}
