import type { AniListSort } from "@/types/anilist";
import { Button } from "@/components/ui/button.component";
import { getSortingLabel } from "@/lib/anilist.utils";
import { Activity, Heart, Dices } from "lucide-react";

interface Props {
  sort: AniListSort;
  onSortChange: (sort: AniListSort) => void;
  onActivityOpen: () => void;
  onFavouritesOpen: () => void;
  onRandom: () => void;
  hasFavourites: boolean;
}

export default function AniListSortBar({
  sort,
  onSortChange,
  onActivityOpen,
  onFavouritesOpen,
  onRandom,
  hasFavourites,
}: Props) {
  const toggleSort = (key: AniListSort["key"]) => {
    onSortChange({
      key,
      dir: sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : sort.dir,
    });
  };

  return (
    <section className="windows95-border bg-white px-1 py-0.5 flex flex-row items-center gap-2">
      <span className="windows95-text text-[10px] text-muted">Сортировка:</span>
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
            {getSortingLabel(s, sort.dir)}
          </Button>
        );
      })}

      <span className="w-px h-5 ml-auto bg-muted" />
      <div className="flex flex-row gap-1">
        <Button size="icon" className="h-6 w-6" onClick={onActivityOpen}>
          <Activity className="size-3.5" />
        </Button>
        <Button
          size="icon"
          className="h-6 w-6"
          title="Избранное"
          onClick={onFavouritesOpen}
          disabled={!hasFavourites}
        >
          <Heart className="size-3.5" />
        </Button>
        <Button size="icon" className="h-6 w-6" title="Случайное из списка" onClick={onRandom}>
          <Dices className="size-3.5" />
        </Button>
      </div>
    </section>
  );
}
