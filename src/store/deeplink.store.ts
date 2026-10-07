import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import type {
  AnimeDeepLink,
  AnilistAuthDeepLink,
  CollectionShareDeepLink,
  DeepLinkStore,
  TorrentDeepLink,
} from "@/types/deeplink";

type DeepLinkActionKeys =
  | "openAnime"
  | "consume"
  | "openTorrent"
  | "consumeTorrent"
  | "openMagnet"
  | "consumeMagnet"
  | "openShare"
  | "consumeShare"
  | "openAuth"
  | "consumeAuth";

export type DeepLinkData = Omit<DeepLinkStore, DeepLinkActionKeys>;
export type DeepLinkAtoms = { [K in keyof DeepLinkData]: Cell<DeepLinkData[K]> };

const DEFAULT_DEEPLINK_DATA: DeepLinkData = {
  target: null,
  torrentTarget: null,
  magnetTarget: null,
  shareTarget: null,
  authTarget: null,
};

export interface DeepLinkSignalStore {
  atoms: DeepLinkAtoms;
  subscribeAll: (fn: () => void) => () => void;
  openAnime: (link: AnimeDeepLink) => void;
  consume: () => void;
  openTorrent: (link: TorrentDeepLink) => void;
  consumeTorrent: () => void;
  openMagnet: (magnet: string) => void;
  consumeMagnet: () => void;
  openShare: (link: CollectionShareDeepLink) => void;
  consumeShare: () => void;
  openAuth: (link: AnilistAuthDeepLink) => void;
  consumeAuth: () => void;
}

export function createDeepLinkSignalStore(): DeepLinkSignalStore {
  const store = createSignalStore();
  const atoms = {} as DeepLinkAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = DEFAULT_DEEPLINK_DATA as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_DEEPLINK_DATA)) {
    sink[key] = store.atom(key, source[key]);
  }

  return {
    atoms,
    subscribeAll: (fn) => store.subscribeAll(fn),
    openAnime: (link) => atoms.target.set(link),
    consume: () => atoms.target.set(null),
    openTorrent: (link) => atoms.torrentTarget.set(link),
    consumeTorrent: () => atoms.torrentTarget.set(null),
    openMagnet: (magnet) => atoms.magnetTarget.set(magnet),
    consumeMagnet: () => atoms.magnetTarget.set(null),
    openShare: (link) => atoms.shareTarget.set(link),
    consumeShare: () => atoms.shareTarget.set(null),
    openAuth: (link) => atoms.authTarget.set(link),
    consumeAuth: () => atoms.authTarget.set(null),
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
export const openMagnetDeepLink = deeplinks.openMagnet;
export const consumeMagnetDeepLink = deeplinks.consumeMagnet;
export const openShareDeepLink = deeplinks.openShare;
export const consumeShareDeepLink = deeplinks.consumeShare;
export const openAuthDeepLink = deeplinks.openAuth;
export const consumeAuthDeepLink = deeplinks.consumeAuth;
