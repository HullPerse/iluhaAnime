import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

import { CopyLinkButton } from "@/routes/components/anilist/detail/copyLinkButton.detail";
import { FavHeartButton } from "@/routes/components/anilist/detail/favHeartButton.detail";
import { useI18n } from "@/hooks/i18n.hook";

export function ShellHeaderActions({
  animeId,
  favoriteLoading,
  hasAnime,
  isFavorite,
  isLoggedIn,
  onToggle,
  siteId,
}: {
  animeId: number;
  favoriteLoading: boolean;
  hasAnime: boolean;
  isFavorite: boolean;
  isLoggedIn: boolean;
  onToggle: () => void;
  siteId: number;
}) {
  const { t } = useI18n();
  return (
    <>
      <CopyLinkButton animeId={animeId} />
      {isLoggedIn && hasAnime ? (
        <FavHeartButton isFavorite={isFavorite} loading={favoriteLoading} onToggle={onToggle} />
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openUrl(`https://anilist.co/anime/${siteId}`);
        }}
        title={t("anilist.controls.open.site")}
        aria-label={t("anilist.controls.open.site")}
        className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
      >
        <ExternalLink className="size-2.5" />
      </button>
    </>
  );
}
