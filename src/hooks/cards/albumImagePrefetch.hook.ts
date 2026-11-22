import { useCallback, useEffect } from "react";

import {
  cancelRemoteImageQueue,
  prefetchRemoteImages,
  setRemoteImageScope,
} from "@/hooks/remoteImage.hook";
import { cardImageUrls } from "@/lib/cards/album.utils";
import type { CollectionItem } from "@/types/api/cards";
import type { CardsAlbumMode } from "@/types/store/cards";

export function useAlbumImagePrefetch(
  loadedCards: readonly CollectionItem[],
  mode: CardsAlbumMode,
  infinite: boolean,
  imageProxy: Parameters<typeof prefetchRemoteImages>[1]
) {
  const onVisibleCardsChange = useCallback(
    (visible: readonly CollectionItem[]) => {
      const urls = cardImageUrls(visible);
      setRemoteImageScope(urls);

      if (infinite) {
        prefetchRemoteImages(urls, imageProxy).catch(() => undefined);
      }
    },
    [imageProxy, infinite]
  );

  useEffect(() => {
    if (mode === "collections" || loadedCards.length === 0) {
      setRemoteImageScope([]);

      return;
    }

    const urls = cardImageUrls(loadedCards);

    if (!infinite) {
      setRemoteImageScope(urls);
      prefetchRemoteImages(urls, imageProxy).catch(() => undefined);
    }
  }, [imageProxy, infinite, loadedCards, mode]);

  useEffect(
    () => () => {
      setRemoteImageScope(null);
      cancelRemoteImageQueue();
    },
    []
  );

  return onVisibleCardsChange;
}
