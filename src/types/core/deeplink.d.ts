import type {
  CollectionExternalIds,
  CollectionStatusDef,
  CollectionType,
} from "@/types/anilist/collection";
import type { AniListId } from "@/types/core/types";

export interface AnimeDeepLink {
  readonly source: "anilist";
  readonly id: AniListId;
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

interface ShareImportPlanRow {
  readonly snapshot: CollectionShareItem;
}

export interface ShareImportPlan {
  readonly link: CollectionShareDeepLink;
  readonly statuses: CollectionStatusDef[];
  readonly rows: ShareImportPlanRow[];
}

export interface StreamDeepLink {
  readonly source: "animelib";
  readonly slug: string;
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
  streamTarget: StreamDeepLink | null;
  openStream: (link: StreamDeepLink) => void;
  consumeStream: () => void;
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

export type PastedLink =
  | { kind: "anime"; link: AnimeDeepLink }
  | { kind: "stream"; link: StreamDeepLink }
  | { kind: "torrent"; link: TorrentDeepLink }
  | { kind: "magnet"; magnet: string }
  | { kind: "collectionShare" };
