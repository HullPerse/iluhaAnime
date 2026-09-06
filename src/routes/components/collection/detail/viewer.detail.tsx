import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { MediaLightbox } from "@/components/shared/mediaLightbox.component";
import { Button } from "@/components/ui/button.component";
import { useCollectionMedia } from "@/hooks/collection/media.hook";
import type { StoredMedia } from "@/lib/collection/media.utils";
import { useI18n } from "@/lib/locale/i18n.utils";

export function MediaViewerCollection({
  tmdbId,
  anilistId,
  mediaType,
  stored,
}: {
  tmdbId: number | null;
  anilistId: number | null;
  mediaType: "movie" | "tv";
  stored: StoredMedia;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const { media, trailer: anilistTrailer } = useCollectionMedia(
    tmdbId,
    anilistId,
    mediaType,
    open && stored.stills.length === 0,
    open && stored.trailerYoutubeId === null
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
  return (
    <>
      <div className="flex flex-row gap-1">
        {tmdbId !== null || stored.stills.length > 0 ? (
          <Button
            className="h-5 px-1 text-xs"
            onClick={() => {
              setShowTrailer(false);
              setOpen(true);
            }}
          >
            {t("collection.details.stills")}
          </Button>
        ) : null}
        {trailer ? (
          <Button
            className="h-5 px-1 text-xs"
            onClick={() => {
              setShowTrailer(true);
              setOpen(true);
            }}
          >
            {t("collection.details.trailer")}
          </Button>
        ) : null}
      </div>
      {open ? (
        pending && stills.length === 0 && !trailer ? (
          <SmallLoader />
        ) : (
          <MediaLightbox
            title={t("collection.details.stills")}
            stills={stills}
            trailerYoutubeId={trailer}
            trailerLabel={t("collection.details.trailer")}
            counterLabel={(current, total) => `${current}/${total}`}
            emptyLabel={t("common.no.results")}
            startWithTrailer={showTrailer}
            onClose={() => {
              setOpen(false);
              setShowTrailer(false);
            }}
          />
        )
      ) : null}
    </>
  );
}
