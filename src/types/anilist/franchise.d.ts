import type { FranchiseNode, RelationFilter } from "@/types/anilist/anilist";

export interface FranchiseSection {
  key: "mainline" | RelationFilter;
  items: FranchiseNode[];
}

export interface FranchiseNext {
  id: number;
  episode: number | null;
}

export interface FranchiseSummary {
  titles: number;
  episodes: number;
  watched: number;
  percent: number | null;
}
