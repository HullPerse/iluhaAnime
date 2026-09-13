import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Dices,
  Hash,
  Heart,
  Infinity as InfinityIcon,
  Layers,
  SortAsc,
  SortDesc,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { defaultListSortDir, getSortingLabel, listSortKeys } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniSortProps as Props } from "@/types/anilist";

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
    <section className="windows95-border flex flex-row items-center gap-2 bg-white px-1 py-0.5">
      <div className="flex min-w-0 flex-1 items-center gap-1" aria-label={t("anilist.sort.sorting")}>
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
            onClick={onActivityOpen}
            aria-label={t("anilist.sort.history")}
          >
            <Activity className="size-3.5" />
          </Button>
        )}
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
          <Button
            size="icon"
            className="h-6 w-6"
            title={t("anilist.sort.spotlight")}
            aria-label={t("anilist.sort.spotlight")}
            onClick={onSpotlight}
          >
            <Sparkles className="size-3.5" />
          </Button>
        )}
        {showActions && <span className="bg-muted h-5 w-px" aria-hidden />}
        {showActions && (
          <Button
            size="icon"
            className="h-6 w-6"
            title={t("anilist.sort.group.by.status")}
            aria-label={t("anilist.sort.group.by.status")}
            aria-pressed={groupByStatus}
            variant={groupByStatus ? "outline" : "default"}
            onClick={() => onGroupChange(!groupByStatus)}
          >
            <Layers className="size-3.5" />
          </Button>
        )}
        {showActions && (
          <Button
            size="icon"
            className="h-6 w-6"
            title={t(
              displayMode === "scroll"
                ? "anilist.sort.display.scroll"
                : "anilist.sort.display.pagination"
            )}
            aria-label={t(
              displayMode === "scroll"
                ? "anilist.sort.display.scroll"
                : "anilist.sort.display.pagination"
            )}
            aria-pressed={displayMode === "scroll"}
            variant={displayMode === "scroll" ? "outline" : "default"}
            onClick={() => onDisplayChange(displayMode === "scroll" ? "pagination" : "scroll")}
          >
            {displayMode === "scroll" ? (
              <InfinityIcon className="size-3.5" />
            ) : (
              <Hash className="size-3.5" />
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
