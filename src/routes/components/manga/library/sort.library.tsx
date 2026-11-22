import { useCell } from "@hullperse/hp_utils/react";
import { Button } from "@/components/ui/button.component";
import { ChevronLeft, ChevronRight, SortAsc, SortDesc } from "lucide-react";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { sortKeys, sortLabels } from "@/config/manga/library.config";
import { librarySort } from "@/store/manga.store";

export function LibrarySort() {
  const { t } = useI18n();
  const sort = useCell(librarySort);
  const { rowRef, start, end, stepPage } = usePagedRow(sortKeys.length, sortKeys.indexOf(sort.key));
  const DirectionIcon = sort.dir === "desc" ? SortDesc : SortAsc;

  return (
    <section
      className="windows95-border bg-field flex items-center gap-1 px-1 py-0.5"
      aria-label={t("anilist.sort.sorting")}
    >
      <Button
        size="icon"
        className="h-6 w-6 shrink-0"
        title={t("common.previous")}
        aria-label={t("common.previous")}
        onClick={() => stepPage(-1)}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      <div ref={rowRef} className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {sortKeys.slice(start, end).map((key) => (
          <Button
            key={key}
            variant={sort.key === key ? "outline" : "default"}
            className="h-6 w-33 shrink-0 px-1"
            aria-current={sort.key === key ? true : undefined}
            onClick={() => {
              const dir =
                sort.key === key
                  ? sort.dir === "asc"
                    ? "desc"
                    : "asc"
                  : key === "title"
                    ? "asc"
                    : "desc";
              librarySort.set({ key, dir });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{t(sortLabels[key])}</span>
            {sort.key === key && <DirectionIcon className="size-3 shrink-0" />}
          </Button>
        ))}
      </div>
      <Button
        size="icon"
        className="h-6 w-6 shrink-0"
        title={t("common.next")}
        aria-label={t("common.next")}
        onClick={() => stepPage(1)}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </section>
  );
}
