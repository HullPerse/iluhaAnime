import { Images, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

export function DetailHeaderActions({
  item,
  canOpenMedia,
  onMedia,
  onRefresh,
}: {
  item: CollectionItem;
  canOpenMedia: boolean;
  onMedia: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const canRefresh = item.externalIds.anilist != null || item.externalIds.tmdb != null;
  return (
    <>
      <Button
        size="icon"
        className="size-5"
        onClick={onRefresh}
        disabled={!canRefresh}
        aria-label={t("collection.details.refresh.metadata")}
        title={t("collection.details.refresh.metadata")}
      >
        <RefreshCw className="size-3" />
      </Button>
      {canOpenMedia ? (
        <Button
          size="icon"
          className="size-5"
          onClick={onMedia}
          aria-label={t("collection.details.media")}
          title={t("collection.details.media")}
        >
          <Images className="size-3" />
        </Button>
      ) : null}
    </>
  );
}
