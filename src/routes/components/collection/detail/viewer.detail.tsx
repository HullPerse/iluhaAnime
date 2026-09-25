import { MediaLightboxContent } from "@/components/shared/lightbox/mediaLightboxContent.media";
import { SmallLoader } from "@/components/shared/loader.component";
import Tabs from "@/components/shared/tabs.component";
import { useViewerMedia } from "@/hooks/collection/viewer.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { MediaViewerParts } from "@/types/collection";
import type { FilmstripTab } from "@/types/media";

export function MediaViewerContent({
  tmdbId,
  anilistId,
  mediaType,
  stored,
  activeTab,
  onTabChange,
}: MediaViewerParts & {
  activeTab: FilmstripTab;
  onTabChange: (tab: FilmstripTab) => void;
}) {
  const { t } = useI18n();
  const { stills, trailer, pending } = useViewerMedia(tmdbId, anilistId, mediaType, stored);
  if (pending && stills.length === 0 && !trailer) return <SmallLoader />;
  const tabs = [
    { id: "frames" as const, label: t("collection.details.stills") },
    ...(trailer ? [{ id: "trailer" as const, label: t("collection.details.trailer") }] : []),
  ];
  return (
    <div className="flex flex-col gap-1">
      <div className="shrink-0">
        <Tabs<FilmstripTab>
          tabs={tabs}
          activeTab={activeTab}
          onChange={onTabChange}
          ariaLabel={t("collection.details.media")}
        />
      </div>
      <MediaLightboxContent
        stills={stills}
        trailerYoutubeId={trailer}
        trailerLabel={t("collection.details.trailer")}
        activeTab={activeTab}
        hideTabs
      />
    </div>
  );
}
