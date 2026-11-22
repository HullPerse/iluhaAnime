import { mangaStatusColor } from "@/lib/manga/statusColor.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { getMangaLibrary, MANGA_UNASSIGNED_STATUS } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { Plus } from "lucide-react";
import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import { useI18n } from "@/hooks/i18n.hook";
import type { LibraryCopy } from "@/api/manga.api";
import { mangaLibraryStatus } from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";

export function LibraryStatusRow({
  active,
  data,
  items,
  onCreate,
}: {
  active: string;
  onCreate: () => void;
  data?: Awaited<ReturnType<typeof getMangaLibrary>>;
  items: readonly LibraryCopy[];
}) {
  const { t } = useI18n();
  const { statuses = [] } = data ?? {};
  const hidden = useCell(settingsAtoms.mangaHiddenStatuses);
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  return (
    <AniListListsRow
      label={t("manga.library.status")}
      leadingAction={
        <Button
          size="icon"
          className="size-6 shrink-0"
          aria-haspopup="dialog"
          aria-label={t("manga.library.newStatus")}
          title={t("manga.library.newStatus")}
          onClick={onCreate}
        >
          <Plus className="size-4" />
        </Button>
      }
      activeTab={active}
      onChange={(next) => mangaLibraryStatus.set(next)}
      tabs={[
        { id: "", label: `${t("manga.library.all")} (${items.length})` },
        ...statuses
          .filter(({ id }) => id !== MANGA_UNASSIGNED_STATUS && !hidden.includes(id))
          .map(({ id, label, color }) => ({
            id,
            label: `${label} (${counts.get(id) ?? 0})`,
            color: mangaStatusColor(color),
          })),
      ]}
    />
  );
}
