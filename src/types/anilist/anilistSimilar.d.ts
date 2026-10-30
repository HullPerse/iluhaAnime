import type { AniRecommendation } from "@/types/anilist/anilist";

export interface SimilarCardProps {
  item: AniRecommendation;
  rank: number;
  strength: number;
  meta: string;
  strengthLabel: string;
  onOpen?: (id: number) => void;
}
