import { create } from "zustand";

import type {
  AnimeDeepLink,
  CollectionShareDeepLink,
  DeepLinkStore,
  TorrentDeepLink,
} from "@/types/deeplink";

export const useDeepLinkStore = create<DeepLinkStore>((set) => ({
  consume: () => set({ target: null }),
  openAnime: (link: AnimeDeepLink) => set({ target: link }),
  target: null,
  consumeTorrent: () => set({ torrentTarget: null }),
  openTorrent: (link: TorrentDeepLink) => set({ torrentTarget: link }),
  torrentTarget: null,
  consumeMagnet: () => set({ magnetTarget: null }),
  openMagnet: (magnet: string) => set({ magnetTarget: magnet }),
  magnetTarget: null,
  consumeShare: () => set({ shareTarget: null }),
  openShare: (link: CollectionShareDeepLink) => set({ shareTarget: link }),
  shareTarget: null,
}));
