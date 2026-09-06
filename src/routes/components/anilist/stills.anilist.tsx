import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { MediaLightbox } from "@/components/shared/mediaLightbox.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

interface StillSource {
  stills: string[];
  trailerYoutubeId: string | null;
}

async function loadShowcase(
  anime: AniMedia,
  tmdbKey: string | null,
  tmdbProxyUrl: string | null
): Promise<StillSource> {
  if (tmdbKey) {
    const results = await withFallback(
      invokeTyped<{ id: number; media_type: string }[]>("search_tmdb", {
        apiKey: tmdbKey,
        query: anime.title,
        language: "ru-RU",
        includeAdult: false,
        proxyUrl: tmdbProxyUrl || undefined,
      } as unknown as Record<string, unknown>),
      []
    );
    const first = results.find((r) => r.media_type === "movie" || r.media_type === "tv");
    if (first) {
      const media = await withFallback(
        invokeTyped<{ backdrops: { url: string }[]; trailerYoutubeId: string | null }>(
          "get_tmdb_media",
          {
            apiKey: tmdbKey,
            tmdbId: first.id,
            mediaType: first.media_type,
            proxyUrl: tmdbProxyUrl || undefined,
          } as unknown as Record<string, unknown>
        ),
        null
      );
      if (media && media.backdrops.length > 0) {
        return {
          stills: media.backdrops.map((b) => b.url),
          trailerYoutubeId: media.trailerYoutubeId ?? anime.trailer_youtube_id ?? null,
        };
      }
    }
  }
  if (anime.id_mal != null) {
    const pics = await withFallback(
      invokeTyped<{ url: string }[]>("get_anime_stills", { malId: anime.id_mal }),
      []
    );
    return { stills: pics.map((p) => p.url), trailerYoutubeId: anime.trailer_youtube_id ?? null };
  }
  return { stills: [], trailerYoutubeId: anime.trailer_youtube_id ?? null };
}

export function AnilistStills({ anime }: { anime: AniMedia }) {
  const { t } = useI18n();
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["anilist_showcase", anime.id],
    queryFn: () => loadShowcase(anime, tmdbApiKey, tmdbProxyUrl),
    staleTime: Infinity,
  });
  const stills = data?.stills ?? [];
  const trailer = data?.trailerYoutubeId ?? null;
  if (stills.length === 0 && !trailer) return null;
  return (
    <>
      <Section header={t("anilist.details.stills")} className="flex flex-col gap-1 bg-white">
        {stills.length > 0 ? (
          <div className="flex flex-row gap-1 overflow-x-auto">
            {stills.map((url, index) => (
              <button
                key={url}
                type="button"
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0"
                onClick={() => setLightbox(index)}
                aria-label={`${t("anilist.details.stills")} ${index + 1}`}
              >
                <ImageComponent src={url} alt="" className="h-16 w-28 object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        {trailer ? (
          <Button
            className="h-5 self-start px-1 text-xs"
            onClick={() => {
              setLightbox(0);
              setTrailerOpen(true);
            }}
          >
            {t("anilist.details.trailer")}
          </Button>
        ) : null}
      </Section>
      {lightbox !== null ? (
        <MediaLightbox
          title={t("anilist.details.stills")}
          stills={stills}
          trailerYoutubeId={trailer}
          trailerLabel={t("anilist.details.trailer")}
          counterLabel={(current, total) => `${current}/${total}`}
          emptyLabel={t("common.no.results")}
          initialIndex={lightbox}
          startWithTrailer={trailerOpen}
          onClose={() => {
            setLightbox(null);
            setTrailerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
