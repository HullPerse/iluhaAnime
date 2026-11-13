import { createSignalStore } from "@hullperse/hp_utils/signal";
import { buildSignalAtoms } from "@/lib/core/persistence/persisted.utils";
import type { Cell } from "@/types/core/signal";
import type {
  AnimeDeepLink,
  AnilistAuthDeepLink,
  CardGiftDeepLink,
  DeepLinkStore,
  NewsDeepLink,
  StreamDeepLink,
  TorrentDeepLink,
} from "@/types/core/deeplink";

type DeepLinkActionKeys =
  | "openAnime"
  | "consume"
  | "openTorrent"
  | "consumeTorrent"
  | "openStream"
  | "consumeStream"
  | "openMagnet"
  | "consumeMagnet"
  | "openAuth"
  | "consumeAuth"
  | "openNews"
  | "consumeNews"
  | "openGift"
  | "consumeGift";

type DeepLinkData = Omit<DeepLinkStore, DeepLinkActionKeys>;
type DeepLinkAtoms = { [K in keyof DeepLinkData]: Cell<DeepLinkData[K]> };

const DEFAULT_DEEPLINK_DATA: DeepLinkData = {
  target: null,
  torrentTarget: null,
  streamTarget: null,
  magnetTarget: null,
  authTarget: null,
  newsTarget: null,
  giftTarget: null,
};

interface DeepLinkSignalStore {
  atoms: DeepLinkAtoms;
  subscribeAll: (fn: () => void) => () => void;
  openAnime: (link: AnimeDeepLink) => void;
  consume: () => void;
  openTorrent: (link: TorrentDeepLink) => void;
  consumeTorrent: () => void;
  openStream: (link: StreamDeepLink) => void;
  consumeStream: () => void;
  openMagnet: (magnet: string) => void;
  consumeMagnet: () => void;
  openAuth: (link: AnilistAuthDeepLink) => void;
  consumeAuth: () => void;
  openNews: (link: NewsDeepLink) => void;
  consumeNews: () => void;
  openGift: (link: CardGiftDeepLink) => void;
  consumeGift: () => void;
}

function createDeepLinkSignalStore(): DeepLinkSignalStore {
  const store = createSignalStore();
  const atoms = buildSignalAtoms(store, DEFAULT_DEEPLINK_DATA);

  return {
    atoms,
    subscribeAll: (fn) => store.subscribeAll(fn),
    openAnime: (link) => atoms.target.set(link),
    consume: () => atoms.target.set(null),
    openTorrent: (link) => atoms.torrentTarget.set(link),
    consumeTorrent: () => atoms.torrentTarget.set(null),
    openStream: (link) => atoms.streamTarget.set(link),
    consumeStream: () => atoms.streamTarget.set(null),
    openMagnet: (magnet) => atoms.magnetTarget.set(magnet),
    consumeMagnet: () => atoms.magnetTarget.set(null),
    openAuth: (link) => atoms.authTarget.set(link),
    consumeAuth: () => atoms.authTarget.set(null),
    openNews: (link) => atoms.newsTarget.set(link),
    consumeNews: () => atoms.newsTarget.set(null),
    openGift: (link) => atoms.giftTarget.set(link),
    consumeGift: () => atoms.giftTarget.set(null),
  };
}

const deeplinks = createDeepLinkSignalStore();

export const deeplinkAtoms = deeplinks.atoms;
export function subscribeDeepLink(listener: () => void): () => void {
  return deeplinks.subscribeAll(listener);
}
export const openAnimeDeepLink = deeplinks.openAnime;
export const consumeDeepLink = deeplinks.consume;
export const openTorrentDeepLink = deeplinks.openTorrent;
export const consumeTorrentDeepLink = deeplinks.consumeTorrent;
export const openStreamDeepLink = deeplinks.openStream;
export const consumeStreamDeepLink = deeplinks.consumeStream;
export const openMagnetDeepLink = deeplinks.openMagnet;
export const consumeMagnetDeepLink = deeplinks.consumeMagnet;
export const openAuthDeepLink = deeplinks.openAuth;
export const consumeAuthDeepLink = deeplinks.consumeAuth;
export const openNewsDeepLink = deeplinks.openNews;
export const consumeNewsDeepLink = deeplinks.consumeNews;
export const openGiftDeepLink = deeplinks.openGift;
export const consumeGiftDeepLink = deeplinks.consumeGift;
