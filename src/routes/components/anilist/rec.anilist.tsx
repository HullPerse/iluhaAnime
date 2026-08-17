import { Star } from "lucide-react";

import Modal from "@/components/shared/modal.component";
import ImageComponent from "@/components/ui/image.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { AniRecommendation } from "@/types/anilist";

interface Props {
  open: boolean;
  loading: boolean;
  recommendations: AniRecommendation[];
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}

export default function AniListRecsModal({
  open,
  loading,
  recommendations,
  onClose,
  onAnimeClick,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <Modal header={t("anilist.recs.title")} onClose={onClose} className="w-3xl">
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <SmallLoader size={6} className="windows95-text" />
        </div>
      ) : recommendations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="windows95-text">{t("anilist.recs.empty")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {recommendations.map((r) => (
            <div
              key={r.id}
              className="windows95-active-border bg-primary hover:bg-surface flex flex-row items-center gap-2 p-1 hover:cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={r.title}
              onClick={() => {
                onClose();
                onAnimeClick(r.id);
              }}
              onKeyDown={enterOrSpace(() => {
                onClose();
                onAnimeClick(r.id);
              })}
            >
              {r.cover_url && (
                <ImageComponent
                  src={r.cover_url}
                  alt="cover_url"
                  className="windows95-active-border h-18 w-13 shrink-0"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className="windows95-text truncate text-[10px] font-bold"
                  title={r.title}
                >
                  {r.title}
                </span>
                <div className="windows95-text flex flex-row gap-2 text-[9px]">
                  {r.score && (
                    <span>
                      <Star className="inline size-2.5" /> {r.score}
                    </span>
                  )}
                  {r.format && <span>{r.format}</span>}
                  {r.episodes && (
                    <span>
                      {r.episodes} {t("anilist.details.epsShort")}
                    </span>
                  )}
                </div>
              </div>
              <span className="windows95-text flex shrink-0 flex-row items-center gap-1 text-[9px]">
                <Star className="size-3" /> {r.recommendation_rating}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
