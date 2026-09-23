import type { CollectionExternalIds, CollectionStatusDef, CollectionType } from "./collection";

export interface AnimeDeepLink {
  readonly source: "anilist";
  readonly id: number;
}

export interface CollectionShareItem {
  readonly title: string;
  readonly type: CollectionType;
  readonly year: number | null;
  readonly status: string;
  readonly externalIds: CollectionExternalIds;
  readonly coverUrl: string | null;
}

export interface CollectionShareDeepLink {
  readonly version: 1;
  readonly label: string | null;
  readonly items: CollectionShareItem[];
}

export interface ShareImportPlanRow {
  readonly snapshot: CollectionShareItem;
}

export interface ShareImportPlan {
  readonly link: CollectionShareDeepLink;
  readonly statuses: CollectionStatusDef[];
  readonly rows: ShareImportPlanRow[];
}

export interface TorrentDeepLink {
  readonly infoHash: string;
}

export interface AnilistAuthDeepLink {
  readonly accessToken: string;
}

export interface DeepLinkStore {
  target: AnimeDeepLink | null;
  openAnime: (link: AnimeDeepLink) => void;
  consume: () => void;
  torrentTarget: TorrentDeepLink | null;
  openTorrent: (link: TorrentDeepLink) => void;
  consumeTorrent: () => void;
  magnetTarget: string | null;
  openMagnet: (magnet: string) => void;
  consumeMagnet: () => void;
  shareTarget: CollectionShareDeepLink | null;
  openShare: (link: CollectionShareDeepLink) => void;
  consumeShare: () => void;
  authTarget: AnilistAuthDeepLink | null;
  openAuth: (link: AnilistAuthDeepLink) => void;
  consumeAuth: () => void;
}
