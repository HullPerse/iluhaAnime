import type { FavouriteAnime } from "@/types/anilist";
import Modal from "@/components/shared/modal.component";
import ImageComponent from "@/components/ui/image.component";
import { Star } from "lucide-react";

interface Props {
  open: boolean;
  favourites: FavouriteAnime[];
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}

export default function AniListFavouritesModal({
  open,
  favourites,
  onClose,
  onAnimeClick,
}: Props) {
  if (!open) return null;

  return (
    <Modal header="Избранное" onClose={onClose} className="w-2xl">
      {favourites.length === 0 ? (
        <div className="flex items-center justify-center flex-1">
          <span className="windows95-text">Нет избранного</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {favourites.map((fav) => (
            <div
              key={fav.id}
              className="flex flex-row items-center gap-2 windows95-active-border bg-primary p-1 hover:bg-surface hover:cursor-pointer"
              onClick={() => {
                onClose();
                onAnimeClick(fav.id);
              }}
            >
              {fav.cover_image?.medium ? (
                <ImageComponent
                  src={fav.cover_image.medium}
                  alt="cover_image.medium"
                  className="w-13 h-18 shrink-0 windows95-active-border"
                />
              ) : (
                <div className="w-10 h-14 shrink-0 windows95-active-border bg-white flex items-center justify-center text-[9px]">
                  ?
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-[10px] font-bold truncate windows95-text"
                  title={fav.title.romaji}
                >
                  {fav.title.romaji}
                </span>
                <div className="flex flex-row gap-2 text-[9px] items-center mt-0.5">
                  {fav.mean_score != null && (
                    <span className="flex flex-row px-1 bg-secondary text-primary text-[10px] font-bold items-center justify-center gap-0.5">
                      <Star className="size-3 fill-white" /> {fav.mean_score}
                    </span>
                  )}
                  {fav.format && (
                    <span className="text-[10px] windows95-font px-1 bg-white windows95-border text-text">
                      {fav.format}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
