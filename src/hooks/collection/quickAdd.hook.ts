import { useState } from "react";

import { useCollectionData, useCollectionMutations } from "@/hooks/collection/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import { mediaToWizardValues } from "@/lib/core/import.utils";
import { withStoredMedia } from "@/lib/anilist/collectionMedia.utils";
import { downloadCover, fetchAddedMedia } from "@/lib/core/quickadd.utils";
import { buildWizardItem } from "@/lib/core/wizard.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { addNotification } from "@/store/notification.store";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/anilist/collection";

export function useQuickAddMedia(
  anime: QuickAddMedia,
  listEntry: QuickAddListEntry | undefined,
  isFavorite: boolean,
  scoreFormat: AnilistScoreFormat
): { exists: boolean; adding: boolean; handleAdd: () => Promise<void> } {
  const { t } = useI18n();
  const { items } = useCollectionData();
  const { addItem } = useCollectionMutations();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const exists = added || items.some((item) => item.externalIds.anilist === anime.id);

  const handleAdd = async (): Promise<void> => {
    if (exists || adding) return;
    setAdding(true);
    const [, error] = await attempt(
      (async () => {
        const values = mediaToWizardValues(anime, listEntry, isFavorite, scoreFormat);
        const coverBlobId = await downloadCover(values.coverUrl);
        const built = buildWizardItem(values, coverBlobId, null);
        const addedMedia = await fetchAddedMedia(anime);
        await addItem(
          addedMedia
            ? {
                ...built,
                detailsJson: withStoredMedia(
                  built.detailsJson,
                  addedMedia.backdrops
                    .map((backdrop) => backdrop.url)
                    .filter(Boolean)
                    .slice(0, 8),
                  addedMedia.trailerYoutubeId
                ),
              }
            : built
        );
        setAdded(true);
      })()
    );
    if (error) addNotification(t("app.collection"), "error", t("collection.quick.add.error"));
    setAdding(false);
  };

  return { adding, exists, handleAdd };
}
