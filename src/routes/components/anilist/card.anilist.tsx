import { Star } from "lucide-react";
import { memo } from "react";

import Image from "@/components/ui/image.component";
import { listStatusLabels, statusLabels } from "@/config/anilist.config";
import { getStatusColor } from "@/lib/anilist.utils";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { AniMedia, AniListAnime } from "@/types/anilist";

interface Props {
  item: AniMedia;
  entryLookup: Map<
    number,
    { progress: number | null; score: number | null; list_status: string }
  >;
  onClick: (anime: AniListAnime) => void;
}

function AniListEntryCard({ item, entryLookup, onClick }: Props) {
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
      <main className="flex w-full flex-row items-start justify-between gap-2 xl:flex-row-reverse">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex flex-row gap-2">
            <h2
              className="windows95-text flex flex-row gap-1 truncate leading-tight font-bold"
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
                  title={t(
                    (listStatusLabels[entry.list_status] ??
                      entry.list_status) as never
                  )}
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
            <span className="text-text text-xs">
              {t(
                (statusLabels[item.status.toUpperCase()] ??
                  item.status) as never
              )}
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
            {entry?.progress != null &&
              entry?.progress > 0 &&
              !item.episodes && (
                <span className="bg-secondary px-1 text-xs text-white">
                  {entry.progress}
                </span>
              )}
            {!entry && item.episodes && (
              <span className="text-text text-xs">
                {item.episodes} {t("anilist.details.epsShort")}
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
      </main>
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
  return true;
});
