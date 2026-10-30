import { Star } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { FavouriteAnime } from "@/types/anilist/anilist";

export function FavouriteAnimeRow({
  fav,
  onSelect,
}: {
  fav: FavouriteAnime;
  onSelect: (id: number) => void;
}) {
  const activate = () => onSelect(fav.id);
  return (
    <div
      className="windows95-active-border bg-primary hover:bg-surface flex flex-row items-center gap-2 p-1 hover:cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={fav.title.romaji}
      onClick={activate}
      onKeyDown={enterOrSpace(activate)}
    >
      {fav.cover_image?.medium ? (
        <ImageComponent
          src={fav.cover_image.medium}
          alt="cover_image.medium"
          className="windows95-active-border h-18 w-13 shrink-0"
        />
      ) : (
        <div className="windows95-active-border bg-field flex h-14 w-10 shrink-0 items-center justify-center text-xs">
          ?
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={fav.title.romaji}>
          {fav.title.romaji}
        </span>
        <div className="mt-0.5 flex flex-row items-center gap-2 text-xs">
          {fav.mean_score != null && (
            <span className="bg-secondary text-primary flex flex-row items-center justify-center gap-0.5 px-1 text-xs font-bold">
              <Star className="size-3 fill-white" /> {fav.mean_score}
            </span>
          )}
          {fav.format && (
            <span className="windows95-font windows95-border text-text bg-field px-1 text-xs">
              {fav.format}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
