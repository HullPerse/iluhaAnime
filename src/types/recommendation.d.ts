import type { AniListCollection, FavouriteAnime } from "./anilist";

export interface LocalAnimeCandidate {
  title: string;
  normalizedTitle: string;
  paths: string[];
  mediaCount: number;
  folderCount: number;
  torrentCount: number;
}

export interface LocalAnimeRecommendation {
  title: string;
  mediaId: number;
  coverUrl: string | null;
  score: number;
  userScore: number | null;
  status: string;
  genres: string[];
  localPaths: string[];
  mediaCount: number;
  folderCount: number;
  torrentCount: number;
  reason: "favourite" | "high-score" | "taste-match" | "local-match";
}

export interface LocalRecommendationInput {
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  candidates: LocalAnimeCandidate[];
}
