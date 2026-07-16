import type { AniRecommendation } from "@/types/anilist";
import Modal from "@/components/shared/modal.component";
import { Loader, Star } from "lucide-react";
import ImageComponent from "@/components/ui/image.component";

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
  if (!open) return null;

  return (
    <Modal header="Рекомендации" onClose={onClose} className="w-3xl">
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader className="size-6 animate-spin windows95-text" />
        </div>
      ) : recommendations.length === 0 ? (
        <div className="flex items-center justify-center flex-1">
          <span className="windows95-text">Нет рекомендаций</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {recommendations.map((r) => (
            <div
              key={r.id}
              className="flex flex-row items-center gap-2 windows95-active-border bg-primary p-1 hover:bg-surface hover:cursor-pointer"
              onClick={() => {
                onClose();
                onAnimeClick(r.id);
              }}
            >
              {r.cover_url && (
                <ImageComponent
                  src={r.cover_url}
                  alt="cover_url"
                  className="w-13 h-18 shrink-0 windows95-active-border"
                />
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-[10px] font-bold truncate windows95-text"
                  title={r.title}
                >
                  {r.title}
                </span>
                <div className="flex flex-row gap-2 text-[9px] windows95-text">
                  {r.score && (
                    <span>
                      <Star className="size-2.5 inline" /> {r.score}
                    </span>
                  )}
                  {r.format && <span>{r.format}</span>}
                  {r.episodes && <span>{r.episodes} эп.</span>}
                </div>
              </div>
              <span className="flex flex-row gap-1 text-[9px] shrink-0 windows95-text items-center">
                <Star className="size-3" /> {r.recommendation_rating}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
