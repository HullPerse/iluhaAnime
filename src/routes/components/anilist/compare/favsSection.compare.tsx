import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { FavouriteAnime } from "@/types/anilist/anilist";

export function FavsSection({
  favourites,
  onAnimeClick,
}: {
  favourites: FavouriteAnime[];
  onAnimeClick?: (id: number) => void;
}) {
  const { t } = useI18n();
  if (favourites.length === 0) return null;
  return (
    <div className="border-t border-black/20 p-2">
      <p className="windows95-text mb-1 text-xs font-bold">
        {t("anilist.compare.common.favs")} ({favourites.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {favourites.slice(0, 12).map((item) => {
          const content = (
            <>
              {item.cover_image?.medium && (
                <ImageComponent
                  src={item.cover_image.medium}
                  alt={item.title.romaji}
                  className="windows95-active-border h-13 w-10 object-cover"
                />
              )}
              <p className="windows95-text truncate text-center text-xs">{item.title.romaji}</p>
            </>
          );
          return onAnimeClick ? (
            <button
              key={item.id}
              type="button"
              title={item.title.romaji}
              onClick={() => onAnimeClick(item.id)}
              className="hover:bg-surface w-10 cursor-pointer border-0 bg-transparent p-0"
            >
              {content}
            </button>
          ) : (
            <div key={item.id} title={item.title.romaji} className="w-10">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
