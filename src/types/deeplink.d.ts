export interface AnimeDeepLink {
  readonly source: "anilist";
  readonly id: number;
}

export interface TorrentDeepLink {
  readonly infoHash: string;
}

export interface DeepLinkStore {
  target: AnimeDeepLink | null;
  openAnime: (link: AnimeDeepLink) => void;
  consume: () => void;
  torrentTarget: TorrentDeepLink | null;
  openTorrent: (link: TorrentDeepLink) => void;
  consumeTorrent: () => void;
}
