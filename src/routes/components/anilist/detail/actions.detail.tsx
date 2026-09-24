import { Button } from "@/components/ui/button.component";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/collection";

import QuickAddButton from "./quickadd.detail";

export function DetailHeaderActions({
  isFavorite,
  trailerId,
  onTrailer,
  anime,
  listEntry,
  scoreFormat,
}: {
  isFavorite: boolean;
  trailerId: string | null;
  onTrailer?: (id: string) => void;
  anime: QuickAddMedia;
  listEntry?: QuickAddListEntry;
  scoreFormat?: AnilistScoreFormat | null;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-row gap-2">
      {trailerId !== null ? (
        <Button className="h-5 shrink-0 px-1 text-xs" onClick={() => onTrailer?.(trailerId)}>
          {t("anilist.details.trailer")}
        </Button>
      ) : null}
      <QuickAddButton
        anime={anime}
        listEntry={listEntry}
        isFavorite={isFavorite}
        scoreFormat={scoreFormat}
      />
    </div>
  );
}
