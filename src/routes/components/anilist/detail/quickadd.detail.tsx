import { Button } from "@/components/ui/button.component";
import { useQuickAddMedia } from "@/hooks/collection/quickAdd.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { parseScoreFormat } from "@/lib/anilist/anilistScore.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/anilist/collection";

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
  const { adding, exists, handleAdd } = useQuickAddMedia(
    anime,
    listEntry,
    isFavorite,
    parseScoreFormat(scoreFormat)
  );

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
