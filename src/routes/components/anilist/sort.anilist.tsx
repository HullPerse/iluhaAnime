import { Popover } from "@base-ui/react/popover";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Dices,
  Hash,
  Heart,
  Infinity as InfinityIcon,
  Layers,
  MoreHorizontal,
  SortAsc,
  SortDesc,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { defaultListSortDir, getSortingLabel, listSortKeys } from "@/lib/anilist/entries.utils";
import type { AniSortProps as Props } from "@/types/anilist";

function SortMoreMenu({
  onActivityOpen,
  onSpotlight,
  groupByStatus,
  onGroupChange,
  displayMode,
  onDisplayChange,
}: {
  onActivityOpen: () => void;
  onSpotlight: () => void;
  groupByStatus: boolean;
  onGroupChange: (grouped: boolean) => void;
  displayMode: "scroll" | "pagination";
  onDisplayChange: (mode: "scroll" | "pagination") => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const itemClass =
    "windows95-text flex w-full cursor-pointer items-center gap-2 bg-transparent px-2 py-1 text-left text-xs hover:bg-secondary";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={t("anilist.sort.more")}
        title={t("anilist.sort.more")}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border"
      >
        <MoreHorizontal className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="z-50 outline-none"
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={12}
        >
          <Popover.Popup className="windows95-border bg-primary min-w-40 p-1 outline-none">
            <button type="button" className={itemClass} onClick={pick(onActivityOpen)}>
              <Activity className="size-3.5" />
              {t("anilist.sort.history")}
            </button>
            <button type="button" className={itemClass} onClick={pick(onSpotlight)}>
              <Sparkles className="size-3.5" />
              {t("anilist.sort.spotlight")}
            </button>
            <button
              type="button"
              className={itemClass}
              aria-pressed={groupByStatus}
              onClick={pick(() => onGroupChange(!groupByStatus))}
            >
              <Layers className="size-3.5" />
              {t("anilist.sort.group.by.status")}
            </button>
            <button
              type="button"
              className={itemClass}
              aria-pressed={displayMode === "scroll"}
              onClick={pick(() =>
                onDisplayChange(displayMode === "scroll" ? "pagination" : "scroll")
              )}
            >
              {displayMode === "scroll" ? (
                <InfinityIcon className="size-3.5" />
              ) : (
                <Hash className="size-3.5" />
              )}
              {t(
                displayMode === "scroll"
                  ? "anilist.sort.display.scroll"
                  : "anilist.sort.display.pagination"
              )}
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

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
