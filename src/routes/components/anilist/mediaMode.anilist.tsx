import { BookOpen, Film } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { anilistMangaMode, trackedManga } from "@/store/anilistManga.store";

export function AniListMediaMode({ manga = false }: { manga?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t("manga.tracking.switch")} className="flex shrink-0 gap-1">
      <Button
        size="icon"
        className="size-6"
        aria-label={t("manga.tracking.anime")}
        title={t("manga.tracking.anime")}
        variant={manga ? "default" : "outline"}
        aria-pressed={!manga}
        onClick={() => {
          trackedManga.set(null);
          anilistMangaMode.set(false);
        }}
      >
        <Film className="size-4" aria-hidden />
      </Button>
      <Button
        size="icon"
        className="size-6"
        aria-label={t("app.manga")}
        title={t("app.manga")}
        variant={manga ? "outline" : "default"}
        aria-pressed={manga}
        onClick={() => anilistMangaMode.set(true)}
      >
        <BookOpen className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
