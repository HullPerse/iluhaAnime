import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useCollectionData, useCollectionMutations } from "@/hooks/collection/queries.hook";
import { parseScoreFormat, type AnilistScoreFormat } from "@/lib/anilist/score.utils";
import { mediaToWizardValues } from "@/lib/collection/import.utils";
import { withStoredMedia } from "@/lib/collection/media.utils";
import { downloadCover, fetchAddedMedia } from "@/lib/collection/quickadd.utils";
import { buildWizardItem } from "@/lib/collection/wizard.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/collection";

export default function QuickAddButton({
  anime,
  listEntry,
  isFavorite,
  scoreFormat,
}: {
  anime: QuickAddMedia;
  listEntry?: QuickAddListEntry;
  isFavorite: boolean;
  scoreFormat?: AnilistScoreFormat | null;
}) {
  const { t } = useI18n();
  const { items } = useCollectionData();
  const { addItem } = useCollectionMutations();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const exists = added || items.some((item) => item.externalIds.anilist === anime.id);

  const handleAdd = async () => {
    if (exists || adding) return;
    setAdding(true);
    const [, error] = await attempt(
      (async () => {
        const values = mediaToWizardValues(
          anime,
          listEntry,
          isFavorite,
          parseScoreFormat(scoreFormat)
        );
        const coverBlobId = await downloadCover(values.coverUrl);
        const built = buildWizardItem(values, coverBlobId, null);
        const added = await fetchAddedMedia(anime);
        await addItem(
          added
            ? {
                ...built,
                detailsJson: withStoredMedia(
                  built.detailsJson,
                  added.backdrops
                    .map((b) => b.url)
                    .filter(Boolean)
                    .slice(0, 8),
                  added.trailerYoutubeId
                ),
              }
            : built
        );
        setAdded(true);
        useNotificationStore
          .getState()
          .add(t("app.collection"), "success", t("collection.quick.add.success"));
      })()
    );
    if (error)
      useNotificationStore
        .getState()
        .add(t("app.collection"), "error", t("collection.quick.add.error"));
    setAdding(false);
  };

  return (
    <Button
      className="h-5 shrink-0 px-1 text-xs"
      disabled={exists || adding}
      onClick={handleAdd}
      title={t(exists ? "collection.quick.added" : "collection.quick.add")}
    >
      {t(exists ? "collection.quick.added" : "collection.quick.add")}
    </Button>
  );
}
