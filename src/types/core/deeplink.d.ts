import type { AniListId } from "@/types/core/types";
import type { CardKind, CardRarity, CardVariant } from "@/types/api/cards";

export interface AnimeDeepLink {
  readonly source: "anilist";
  readonly id: AniListId;
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

export interface NewsDeepLink {
  readonly id: number;
  readonly page: number;
}

export interface CardGiftDeepLink {
  readonly giftId: string;
  readonly kind: CardKind;
  readonly entityId: number;
  readonly rarity: CardRarity;
  readonly variant: CardVariant;
  // Frozen sender-side value. Older links without it fall back to the local
  // gift row or the minimum value for the rarity/variant.
  readonly value: number | null;
}

export interface CardGiftReceiptDeepLink {
  readonly giftId: string;
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
  authTarget: AnilistAuthDeepLink | null;
  openAuth: (link: AnilistAuthDeepLink) => void;
  consumeAuth: () => void;
  newsTarget: NewsDeepLink | null;
  openNews: (link: NewsDeepLink) => void;
  consumeNews: () => void;
  giftTarget: CardGiftDeepLink | null;
  openGift: (link: CardGiftDeepLink) => void;
  consumeGift: () => void;
  giftReceiptTarget: CardGiftReceiptDeepLink | null;
  openGiftReceipt: (link: CardGiftReceiptDeepLink) => void;
  consumeGiftReceipt: () => void;
}

export type PastedLink =
  | { kind: "anime"; link: AnimeDeepLink }
  | { kind: "stream"; link: StreamDeepLink }
  | { kind: "torrent"; link: TorrentDeepLink }
  | { kind: "magnet"; magnet: string }
  | { kind: "news"; link: NewsDeepLink }
  | { kind: "gift"; link: CardGiftDeepLink }
  | { kind: "gift-receipt"; link: CardGiftReceiptDeepLink };
