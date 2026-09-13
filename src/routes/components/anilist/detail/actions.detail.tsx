import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/collection";

import QuickAddButton from "./quickadd.detail";

export function DetailHeaderActions({
  isFavorite,
  trailerId,
  onTrailer,
  anime,
  listEntry,
}: {
  isFavorite: boolean;
  trailerId: string | null;
  onTrailer?: (id: string) => void;
  anime: QuickAddMedia;
  listEntry?: QuickAddListEntry;
}) {
  const { t } = useI18n();
  if (trailerId === null) return null;
  return (
    <div className="flex flex-row gap-2">
      <Button className="h-5 shrink-0 px-1 text-xs" onClick={() => onTrailer?.(trailerId)}>
        {t("anilist.details.trailer")}
      </Button>
      <QuickAddButton anime={anime} listEntry={listEntry} isFavorite={isFavorite} />
    </div>
  );
}
