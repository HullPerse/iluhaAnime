import { Activity, Heart, Dices, SortAsc, SortDesc } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { getSortingLabel } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListSort } from "@/types/anilist";
import type { AniSortProps as Props } from "@/types/anilist";

export default function AniListSortBar({
  sort,
  onSortChange,
  onActivityOpen,
  onFavouritesOpen,
  onRandom,
  hasFavourites,
}: Props) {
  const { t } = useI18n();
  const toggleSort = (key: AniListSort["key"]) => {
    onSortChange({
      key,
      dir: sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : sort.dir,
    });
  };

  return (
    <section className="windows95-border flex flex-row items-center gap-2 bg-white px-1 py-0.5">
      <span className="windows95-text text-hint text-xs">{t("anilist.sort.sorting")}</span>
      {(["title", "score", "progress"] as AniListSort["key"][]).map((s) => {
        const isActive = sort.key === s;
        return (
          <Button
            key={s}
            variant={isActive ? "outline" : "default"}
            size="default"
            className="px-2 py-0.5"
            onClick={() => toggleSort(s)}
          >
            {t(getSortingLabel(s) as never)}
            {isActive &&
              (sort.dir === "asc" ? (
                <SortAsc className="size-3" />
              ) : (
                <SortDesc className="size-3" />
              ))}
          </Button>
        );
      })}

      <span className="bg-muted ml-auto h-5 w-px" />
      <div className="flex flex-row gap-1">
        <Button
          size="icon"
          className="h-6 w-6"
          onClick={onActivityOpen}
          aria-label={t("anilist.sort.history")}
        >
          <Activity className="size-3.5" />
        </Button>
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
        <Button
          size="icon"
          className="h-6 w-6"
          title={t("anilist.sort.random")}
          aria-label={t("anilist.sort.random")}
          onClick={onRandom}
        >
          <Dices className="size-3.5" />
        </Button>
      </div>
    </section>
  );
}
