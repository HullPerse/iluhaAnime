import { ChevronLeft, ChevronRight, Dices, Heart, SortAsc, SortDesc } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { defaultListSortDir, listSortKeys } from "@/config/anilist/list.config";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { getSortingLabel } from "@/lib/anilist/entries.utils";
import type { AniSortProps as Props } from "@/types/anilist/anilist";

import { SortMoreMenu } from "@/routes/components/anilist/sort/sortMoreMenu.sort";

export default function AniListSortBar({
  sort,
  onSortChange,
  onActivityOpen,
  onFavouritesOpen,
  onRandom,
  onSpotlight,
  hasFavourites,
  groupByStatus,
  onGroupChange,
  displayMode,
  onDisplayChange,
  showActions = true,
}: Props) {
  const { t } = useI18n();
  const { rowRef, start, end, stepPage } = usePagedRow(
    listSortKeys.length,
    listSortKeys.indexOf(sort.key)
  );

  return (
    <section className="windows95-border bg-field flex flex-row items-center gap-2 px-1 py-0.5">
      <div
        className="flex min-w-0 flex-1 items-center gap-1"
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
          {listSortKeys.slice(start, end).map((key) => (
            <Button
              key={key}
              variant={sort.key === key ? "outline" : "default"}
              className="h-6 w-33 shrink-0 px-1"
              aria-current={sort.key === key ? true : undefined}
              onClick={() =>
                onSortChange(
                  key === sort.key
                    ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
                    : { key, dir: defaultListSortDir[key] }
                )
              }
            >
              <span className="min-w-0 flex-1 truncate">{t(getSortingLabel(key))}</span>
              {sort.key === key &&
                (sort.dir === "desc" ? (
                  <SortDesc className="size-3 shrink-0" />
                ) : (
                  <SortAsc className="size-3 shrink-0" />
                ))}
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
      </div>
      <span className="bg-muted ml-auto h-5 w-px" />
      <div className="flex flex-row gap-1">
        {showActions && (
          <Button
            size="icon"
            className="h-6 w-6"
            title={t("anilist.sort.favourites")}
            aria-label={t("anilist.sort.favourites")}
            onClick={onFavouritesOpen}
            disabled={!hasFavourites}
          >
            <Heart className="size-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          className="h-6 w-6"
          title={t("anilist.sort.random")}
          aria-label={t("anilist.sort.random")}
          onClick={onRandom}
        >
          <Dices className="size-3.5" />
        </Button>
        {showActions && (
          <SortMoreMenu
            onActivityOpen={onActivityOpen}
            onSpotlight={onSpotlight}
            groupByStatus={groupByStatus}
            onGroupChange={onGroupChange}
            displayMode={displayMode}
            onDisplayChange={onDisplayChange}
          />
        )}
      </div>
    </section>
  );
}
