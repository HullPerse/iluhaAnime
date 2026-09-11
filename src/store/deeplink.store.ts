import { create } from "zustand";

import type { AnimeDeepLink, DeepLinkStore, TorrentDeepLink } from "@/types/deeplink";

export const useDeepLinkStore = create<DeepLinkStore>((set) => ({
  consume: () => set({ target: null }),
  openAnime: (link: AnimeDeepLink) => set({ target: link }),
  target: null,
  consumeTorrent: () => set({ torrentTarget: null }),
  openTorrent: (link: TorrentDeepLink) => set({ torrentTarget: link }),
  torrentTarget: null,
}));
