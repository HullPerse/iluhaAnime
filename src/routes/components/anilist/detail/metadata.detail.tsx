import { Calendar, Star, Tv, Heart, Eye } from "lucide-react";
import { useEffect, useState } from "react";

import ImageComponent from "@/components/ui/image.component";
import { formatLabels, seasonLabels, statusLabels } from "@/config/anilist/labels.config";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import {
  AIRING_TICK_MS,
  airingCountdownSecs,
  formatAiringCountdown,
  formatAiringLocal,
} from "@/lib/anilist/airing.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { AniMedia } from "@/types/anilist";

function AniListMetadata({
  anime,
  onSeason,
}: {
  anime: AniMedia;
  onSeason?: (season: string, seasonYear: number | null) => void;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const bestRank =
    anime.rankings.length > 0 ? anime.rankings.reduce((a, b) => (a.rank < b.rank ? a : b)) : null;
  const coverSrc = useRemoteImage(anime.cover_url);
  const airingAt = anime.next_airing_at;
  const airingLocal = formatAiringLocal(airingAt, locale);
  const airingCountdown = formatAiringCountdown(airingCountdownSecs(airingAt, now), t);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AIRING_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-row gap-3">
      <section className="windows95-border bg-field shrink-0 self-start">
        <ImageComponent
          src={coverSrc ?? "/images/unknown_source.png"}
          alt={anime.title}
          className="block h-54 w-36"
        />
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {anime.score != null && (
            <span className="windows95-text bg-secondary text-title-text flex flex-row items-center gap-1 px-1 font-bold">
              <Star className="size-3 fill-white" /> {anime.score}
            </span>
          )}
          <span className="windows95-text">
            {t(toLocaleKey(statusLabels[anime.status] ?? anime.status))}
          </span>
          {anime.format && (
            <span className="windows95-font windows95-border text-text bg-field px-1 text-xs">
              {t(toLocaleKey(formatLabels[anime.format] ?? anime.format))}
            </span>
          )}
        </div>

        <div className="windows95-text flex flex-wrap gap-1 underline">
          <Tv className="size-3" />
          {anime.episodes != null && (
            <span>
              {anime.episodes} {t("anilist.details.eps.short")}
            </span>
          )}
          {anime.duration != null && (
            <span>× {t("anilist.metadata.minutes", { count: anime.duration })}</span>
          )}
        </div>

        {anime.season && (
          <div
            className="windows95-text cursor-pointer underline"
            onClick={() => onSeason?.(anime.season!, anime.season_year)}
          >
            {t(toLocaleKey(seasonLabels[anime.season] ?? anime.season))} {anime.season_year}
          </div>
        )}

        {anime.end_date && (
          <div className="windows95-text flex flex-wrap gap-1 underline">
            <Calendar className="size-3" />
            <span className="flex flex-row gap-1">
              {anime.start_date} / {anime.end_date}
            </span>
          </div>
        )}

        {anime.next_episode != null && airingAt != null && airingLocal != null && (
          <span
            className="windows95-text text-success font-bold"
            title={new Date(airingAt * 1000).toLocaleString(locale)}
          >
            {t("anilist.metadata.next.episode", { n: anime.next_episode })} - {airingLocal}
            {airingCountdown ? ` (${t("anilist.airing.in", { time: airingCountdown })})` : ""}
          </span>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {bestRank && (
            <span className="windows95-text windows95-border bg-field px-1 text-xs">
              #{bestRank.rank} {bestRank.context}
            </span>
          )}
          {anime.popularity != null && (
            <span className="windows95-text flex flex-row items-center gap-0.5 text-xs">
              <Eye className="size-2.5" /> {anime.popularity.toLocaleString()}
            </span>
          )}
          {anime.favourites != null && (
            <span className="windows95-text flex flex-row items-center gap-0.5 text-xs">
              <Heart className="size-2.5" /> {anime.favourites.toLocaleString()}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

export default AniListMetadata;
