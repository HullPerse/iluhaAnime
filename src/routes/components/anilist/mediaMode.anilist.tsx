import { useCell } from "@hullperse/hp_utils/react";
import { ArrowLeftRight, BookOpen, Film } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { anilistMangaMode, trackedManga } from "@/store/anilistManga.store";

export function AniListMediaMode({ manga: mode }: { manga?: boolean }) {
  const { t } = useI18n();
  const selected = useCell(anilistMangaMode);
  const manga = mode ?? selected;
  const label = t(manga ? "app.manga" : "manga.tracking.anime");
  const target = t(manga ? "manga.tracking.anime" : "app.manga");
  const Icon = manga ? BookOpen : Film;

  return (
    <Button
      className="h-7 shrink-0 gap-1 px-1.5"
      title={`${label} → ${target}`}
      aria-label={`${label} → ${target}`}
      onClick={() => {
        trackedManga.set(null);
        anilistMangaMode.set(!manga);
      }}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{label}</span>
      <ArrowLeftRight className="size-3" aria-hidden />
    </Button>
  );
}
