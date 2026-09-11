import { cn } from "cn";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function PersonFavButton({
  id,
  favouriteIds,
  labelled,
  onToggle,
}: {
  id: number;
  favouriteIds?: Set<number>;
  labelled?: boolean;
  onToggle?: (id: number) => void;
}) {
  const { t } = useI18n();
  const isFav = favouriteIds?.has(id) ?? false;
  const label = isFav ? t("anilist.details.remove.fav") : t("anilist.details.add.fav");
  const heart = (
    <Heart
      className={cn("size-4", isFav ? "fill-red-500 text-red-500" : "text-text")}
    />
  );
  if (labelled) {
    return (
      <Button
        variant="outline"
        onClick={() => onToggle?.(id)}
        title={label}
        aria-label={label}
        aria-pressed={isFav}
      >
        {heart}
      </Button>
    );
  }
  return (
    <Button
      size="icon"
      className="size-5"
      onClick={() => onToggle?.(id)}
      title={label}
      aria-label={label}
      aria-pressed={isFav}
    >
      {heart}
    </Button>
  );
}
