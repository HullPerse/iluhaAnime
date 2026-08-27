import { Star } from "lucide-react";

import Modal from "@/components/shared/modal.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { FavouriteAnime } from "@/types/anilist";

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
  const { t } = useI18n();
  if (!open) return null;

  return (
    <Modal
      header={t("anilist.favourites.title")}
      onClose={onClose}
      className="w-2xl"
    >
      {favourites.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="windows95-text">
            {t("anilist.favourites.empty")}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {favourites.map((fav) => (
            <div
              key={fav.id}
              className="windows95-active-border bg-primary hover:bg-surface flex flex-row items-center gap-2 p-1 hover:cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={fav.title.romaji}
              onClick={() => {
                onClose();
                onAnimeClick(fav.id);
              }}
              onKeyDown={enterOrSpace(() => {
                onClose();
                onAnimeClick(fav.id);
              })}
            >
              {fav.cover_image?.medium ? (
                <ImageComponent
                  src={fav.cover_image.medium}
                  alt="cover_image.medium"
                  className="windows95-active-border h-18 w-13 shrink-0"
                />
              ) : (
                <div className="windows95-active-border flex h-14 w-10 shrink-0 items-center justify-center bg-white text-xs">
                  ?
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className="windows95-text truncate text-xs font-bold"
                  title={fav.title.romaji}
                >
                  {fav.title.romaji}
                </span>
                <div className="mt-0.5 flex flex-row items-center gap-2 text-xs">
                  {fav.mean_score != null && (
                    <span className="bg-secondary text-primary flex flex-row items-center justify-center gap-0.5 px-1 text-xs font-bold">
                      <Star className="size-3 fill-white" /> {fav.mean_score}
                    </span>
                  )}
                  {fav.format && (
                    <span className="windows95-font windows95-border text-text bg-white px-1 text-xs">
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
