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

import { Button } from "@/components/ui/button.component";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown/checkboxItem.dropdown";
import { DropdownMenuContent } from "@/components/ui/dropdown/content.dropdown";
import { DropdownMenuGroup } from "@/components/ui/dropdown/group.dropdown";
import { DropdownMenuItem } from "@/components/ui/dropdown/item.dropdown";
import { DropdownMenu } from "@/components/ui/dropdown/menu.dropdown";
import { DropdownMenuRadioGroup } from "@/components/ui/dropdown/radioGroup.dropdown";
import { DropdownMenuRadioItem } from "@/components/ui/dropdown/radioItem.dropdown";
import { DropdownMenuSeparator } from "@/components/ui/dropdown/separator.dropdown";
import { DropdownMenuTrigger } from "@/components/ui/dropdown/trigger.dropdown";
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon"
            className="h-6 w-6 shrink-0"
            title={t("anilist.sort.more")}
            aria-label={t("anilist.sort.more")}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onActivityOpen}>
            <Activity className="size-4" />
            {t("anilist.sort.history")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSpotlight}>
            <Sparkles className="size-4" />
            {t("anilist.sort.spotlight")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={groupByStatus}
            onCheckedChange={(checked) => onGroupChange(checked === true)}
            title={t("anilist.sort.group.by.status")}
          >
            <Layers className="size-4" />
            {t("anilist.sort.group.by.status")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup
            value={displayMode}
            onValueChange={(v) => onDisplayChange(v as typeof displayMode)}
          >
            <DropdownMenuRadioItem value="scroll" title={t("anilist.sort.display.scroll")}>
              <InfinityIcon className="size-4" />
              {t("anilist.sort.display.scroll")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="pagination"
              title={t("anilist.sort.display.pagination")}
            >
              <Hash className="size-4" />
              {t("anilist.sort.display.pagination")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
