import { Heart, Star } from "lucide-react";
import { memo } from "react";

import { FavPeopleStar } from "@/components/shared/favPeopleStar.component";
import Image from "@/components/ui/image.component";
import { listStatusLabels, statusLabels } from "@/config/anilist/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { AniCardProps as Props } from "@/types/anilist";

function AniListEntryCard({ item, entryLookup, isFavorite, onClick }: Props) {
  const { t } = useI18n();
  const entry = entryLookup.get(item.id);

  const openAnime = () =>
    onClick({
      animeId: item.id,
      ...(entry && {
        listEntry: {
          progress: entry.progress,
          score: entry.score,
          list_status: entry.list_status,
        },
      }),
    });

  return (
    <div
      className="windows95-active-border bg-primary hover:bg-surface flex max-h-36 min-h-28 flex-row p-2 hover:cursor-pointer"
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
            <FavPeopleStar animeId={item.id} className="size-3 fill-yellow-400 text-yellow-600" />
            <h2
              className="windows95-text flex min-w-0 flex-1 flex-row gap-1 truncate leading-tight font-bold"
              title={item.title}
            >
              {entry && (
                <span
                  className="windows95-border mt-0.5 shrink-0"
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    backgroundColor: getStatusColor(entry.list_status),
                  }}
                  title={t(toLocaleKey(listStatusLabels[entry.list_status] ?? entry.list_status))}
                />
              )}
              {item.title}
            </h2>
          </div>

          <div className="windows95-text mt-auto flex flex-row items-center gap-2 font-bold">
            {item.score && (
              <span className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs">
                <Star className="size-3 fill-white" /> {item.score}
              </span>
            )}
            {entry?.score != null && entry.score !== 0 && (
              <span
                className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs"
                title={t("anilist.card.my.score", { score: entry.score })}
              >
                <Star className="size-3 fill-yellow-400 text-yellow-600" /> {entry.score} / 10
              </span>
            )}
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
            {entry?.progress != null && item.episodes && (
              <div className="flex items-center gap-1">
                <div className="windows95-border relative h-3.5 w-20 overflow-hidden bg-white">
                  <div
                    className="bg-secondary h-full"
                    style={{
                      width: `${Math.min(100, Math.round((entry.progress / item.episodes) * 100))}%`,
                    }}
                  />
                </div>
                <span className="windows95-text text-xs">
                  {entry.progress}/{item.episodes}
                </span>
              </div>
            )}
            {entry?.progress != null && entry?.progress > 0 && !item.episodes && (
              <span className="bg-secondary px-1 text-xs text-white">{entry.progress}</span>
            )}
            {!entry && item.episodes && (
              <span className="text-text text-xs">
                {item.episodes} {t("anilist.details.eps.short")}
              </span>
            )}
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
  if (prev.item.title !== next.item.title) return false;
  if (prev.item.status !== next.item.status) return false;
  if (prev.item.cover_url !== next.item.cover_url) return false;
  if (prev.entryLookup !== next.entryLookup) return false;
  if (prev.isFavorite !== next.isFavorite) return false;
  return true;
});
