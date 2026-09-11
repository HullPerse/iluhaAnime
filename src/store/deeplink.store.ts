import { create } from "zustand";

import type { AnimeDeepLink, DeepLinkStore } from "@/types/deeplink";

export const useDeepLinkStore = create<DeepLinkStore>((set) => ({
  consume: () => set({ target: null }),
  openAnime: (link: AnimeDeepLink) => set({ target: link }),
  target: null,
}));
