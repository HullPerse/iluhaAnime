import { Link } from "@tanstack/react-router";
import { openTrackedManga } from "@/store/anilistManga.store";
import { Info } from "lucide-react";
import type { MangaHit } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function MangaAniListButton({ hit, onClose }: { hit: MangaHit; onClose: () => void }) {
  const { t } = useI18n();
  const id = hit.externalIds.anilist;

  if (id == null || !Number.isSafeInteger(id) || id <= 0) return null;

  return (
    <Button
      render={<Link to="/anilist" />}
      nativeButton={false}
      size="icon"
      className="size-5"
      title={t("collection.detail.open.anilist")}
      aria-label={t("collection.detail.open.anilist")}
      onClick={() => {
        openTrackedManga(id, hit.title);
        onClose();
      }}
    >
      <Info className="size-2.5" aria-hidden />
    </Button>
  );
}
