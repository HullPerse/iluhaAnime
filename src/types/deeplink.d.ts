export interface AnimeDeepLink {
  readonly source: "anilist";
  readonly id: number;
}

export interface DeepLinkStore {
  target: AnimeDeepLink | null;
  openAnime: (link: AnimeDeepLink) => void;
  consume: () => void;
}
