import { cn } from "cn";
import { Heart } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function FavHeartButton({
  isFavorite,
  loading,
  onToggle,
}: {
  isFavorite: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
      aria-label={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
      className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px disabled:cursor-default disabled:brightness-90"
    >
      {loading ? (
        <SmallLoader size={2} />
      ) : (
        <Heart className={cn("size-2.5", isFavorite ? "fill-red-500 text-red-500" : "text-text")} />
      )}
    </button>
  );
}
