import { SmallLoader } from "@/components/shared/loader.component";
import { MediaLightboxContent } from "@/components/shared/mediaLightbox.component";
import type { FilmstripTab } from "@/components/shared/filmstrip.component";
import Tabs from "@/components/shared/tabs.component";
import { useCollectionMedia } from "@/hooks/collection/media.hook";
import type { StoredMedia } from "@/lib/collection/media.utils";
import { useI18n } from "@/lib/locale/i18n.utils";

interface MediaViewerParts {
  tmdbId: number | null;
  anilistId: number | null;
  mediaType: "movie" | "tv";
  stored: StoredMedia;
}

function useViewerMedia(
  tmdbId: number | null,
  anilistId: number | null,
  mediaType: "movie" | "tv",
  stored: StoredMedia
) {
  const { media, trailer: anilistTrailer } = useCollectionMedia(
    tmdbId,
    anilistId,
    mediaType,
    stored.stills.length === 0,
    stored.trailerYoutubeId === null
  );
  const data = media.data;
  const pending = media.isLoading || anilistTrailer.isLoading;
  const trailer =
    stored.trailerYoutubeId ??
    data?.trailerYoutubeId ??
    anilistTrailer.data?.trailer_youtube_id ??
    null;
  const stills =
    stored.stills.length > 0 ? stored.stills : (data?.backdrops ?? []).map((b) => b.url);
  return { stills, trailer, pending };
}

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
      <Tabs<FilmstripTab>
        tabs={tabs}
        activeTab={activeTab}
        onChange={onTabChange}
        ariaLabel={t("collection.details.media")}
      />
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
