import { Heart, Star } from "lucide-react";
import { memo } from "react";

import Image from "@/components/ui/image.component";
import { statusLabels } from "@/config/system/labels.config";
import { useProgressOverride } from "@/hooks/anilist/progressOverride.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useThemeComponents } from "@/hooks/themeComponents.hook";
import { cardListEntry } from "@/lib/anilist/card.utils";
import { formatEntryScore, hasRating, parseScoreFormat } from "@/lib/anilist/anilistScore.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { AniCardProps as Props } from "@/types/anilist/anilist";

import CardListDate from "@/routes/components/anilist/date.anilist";
import CardAiredCount from "@/routes/components/anilist/episode.anilist";
import { StatusDot } from "@/routes/components/anilist/card/statusDot.card";
import { MyScoreBadge } from "@/routes/components/anilist/card/myScoreBadge.card";
import { CardProgressBlock } from "@/routes/components/anilist/card/cardProgressBlock.card";

function AniListEntryCard({ item, entryLookup, isFavorite, scoreFormat, onClick }: Props) {
  const { t } = useI18n();
  const { cardMeta } = useThemeComponents();
  const shortMeta = cardMeta === "short";
  const entry = entryLookup.get(item.id);
  const format = parseScoreFormat(scoreFormat);
  const override = useProgressOverride(item.id);
  const progress = override?.progress ?? entry?.progress ?? null;
  const effectiveStatus = override?.status ?? entry?.list_status;
  const listEntry = cardListEntry(entry, effectiveStatus, progress);

  const openAnime = () => onClick({ animeId: item.id, ...(listEntry && { listEntry }) });

  return (
    <div
      className="windows95-active-border bg-primary hover:bg-surface group relative flex max-h-36 min-h-28 flex-row p-2 hover:cursor-pointer"
      onClick={openAnime}
      role="button"
      tabIndex={0}
      aria-label={item.title}
      onKeyDown={enterOrSpace(openAnime)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex w-full flex-row items-start justify-between gap-2 xl:flex-row-reverse">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-1 flex-row items-start gap-1">
            <h2
              className="windows95-text flex min-w-0 flex-1 flex-row gap-1 truncate leading-tight font-bold"
              title={item.title}
            >
              {effectiveStatus && <StatusDot status={effectiveStatus} />}
              {item.title}
            </h2>
          </div>

          <div className="windows95-text mt-auto flex flex-row items-center gap-2 font-bold">
            {hasRating(item.score) && (
              <span className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs">
                <Star className="size-3 fill-white" /> {item.score}
              </span>
            )}

            {!shortMeta && (
              <CardAiredCount
                status={item.status}
                nextEpisode={item.next_episode}
                total={item.episodes}
              />
            )}

            <MyScoreBadge
              score={entry?.score}
              format={format}
              title={t("anilist.card.my.score", {
                score: formatEntryScore(entry?.score, format) ?? "",
              })}
            />
            {isFavorite && (
              <span
                className="bg-secondary text-primary flex h-4 w-4 flex-row items-center justify-center"
                title={t("anilist.card.favorite")}
                aria-label={t("anilist.card.favorite")}
              >
                <Heart className="size-3 fill-red-400 text-red-100" />
              </span>
            )}
            <span className="text-text text-xs">
              {t(toLocaleKey(statusLabels[item.status.toUpperCase()] ?? item.status))}
            </span>
            <CardProgressBlock item={item} entry={entry} progress={progress} />
            {!entry && item.episodes && (
              <span className="text-text text-xs">
                {item.episodes} {t("anilist.details.eps.short")}
              </span>
            )}

            {!shortMeta && <CardListDate entry={entry} fallback={item.end_date} />}
          </div>
        </section>

        {item.cover_url && (
          <Image
            src={item.cover_url}
            alt={`${item.title} cover`}
            className="windows95-active-border h-full w-14 shrink-0"
          />
        )}
      </div>
    </div>
  );
}

export default memo(AniListEntryCard, (prev, next) => {
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.score !== next.item.score) return false;
  if (prev.item.episodes !== next.item.episodes) return false;
  if (prev.item.next_episode !== next.item.next_episode) return false;
  if (prev.item.title !== next.item.title) return false;
  if (prev.item.status !== next.item.status) return false;
  if (prev.item.cover_url !== next.item.cover_url) return false;
  if (prev.entryLookup !== next.entryLookup) return false;
  if (prev.isFavorite !== next.isFavorite) return false;
  if (prev.scoreFormat !== next.scoreFormat) return false;
  return true;
});
