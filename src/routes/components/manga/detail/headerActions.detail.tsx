import { useCell } from "@hullperse/hp_utils/react";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink } from "lucide-react";
import type { MangaHit, MangaSource } from "@/api/manga.api";
import { useI18n } from "@/hooks/i18n.hook";
import { buildMangaLink } from "@/lib/core/system/deeplink.utils";
import { mangaTitleUrl } from "@/lib/manga/sourcePage.utils";
import { HeaderAction } from "@/routes/components/stream/detail/headerAction.detail";
import { settingsAtoms } from "@/store/settings.store";
import { MangaAniListButton } from "@/routes/components/manga/detail/aniListButton.detail";

export function MangaHeaderActions({
  source,
  id,
  hit,
  onClose,
}: {
  source: MangaSource;
  id: string;
  hit?: MangaHit;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const browserDomain = useCell(settingsAtoms.mangaLibBrowserDomain);
  const website = mangaTitleUrl(source, hit?.id ?? id, browserDomain);

  return (
    <>
      {website && (
        <HeaderAction
          title={t("manga.details.openSourcePage")}
          icon={<ExternalLink className="size-2.5" aria-hidden />}
          onClick={() => {
            openUrl(website).catch((error: unknown) =>
              reportBackgroundError("manga.source-page", error)
            );
          }}
        />
      )}
      <HeaderAction
        title={t("manga.details.copyLink")}
        icon={<Copy className="size-2.5" aria-hidden />}
        onClick={() => {
          writeText(buildMangaLink({ source, id: hit?.id ?? id })).catch((error: unknown) =>
            reportBackgroundError("manga.copy-link", error)
          );
        }}
      />
      {hit && <MangaAniListButton hit={hit} onClose={onClose} />}
    </>
  );
}
