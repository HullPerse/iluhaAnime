import { memo } from "react";
import type { AniMedia, AniListAnime } from "@/types/anilist";
import {
  getStatusLabel,
  getStatusColor,
  getListLabel,
} from "@/lib/anilist.utils";
import Image from "@/components/ui/image.component";
import { Star } from "lucide-react";

interface Props {
  item: AniMedia;
  entryLookup: Map<
    number,
    { progress: number | null; score: number | null; list_status: string }
  >;
  onClick: (anime: AniListAnime) => void;
}

function AniListEntryCard({
  item,
  entryLookup,
  onClick,
}: Props) {
  const entry = entryLookup.get(item.id);

  return (
    <div
      className="flex flex-row windows95-active-border bg-primary p-2 hover:bg-surface hover:cursor-pointer min-h-28 max-h-36"
      onClick={() =>
        onClick({
          animeId: item.id,
          ...(entry && {
            listEntry: {
              progress: entry.progress,
              score: entry.score,
              list_status: entry.list_status,
            },
          }),
        })
      }
      onContextMenu={(e) => e.preventDefault()}
    >
      <main className="flex xl:flex-row-reverse flex-row w-full items-start justify-between gap-2">
        <section className="min-w-0 flex-1 h-full flex flex-col">
          <div className="flex flex-row gap-2">
            <h2
              className="flex flex-row gap-1 truncate font-bold leading-tight windows95-text"
              title={item.title}
            >
              {entry && (
                <span
                  className="windows95-border shrink-0 mt-0.5"
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    backgroundColor: getStatusColor(entry.list_status),
                  }}
                  title={getListLabel(entry.list_status) ?? entry.list_status}
                />
              )}
              {item.title}
            </h2>
          </div>

          <div className="flex flex-row gap-2 items-center mt-auto windows95-text font-bold">
            {item.score && (
              <span className="flex flex-row items-center gap-0.5 px-1 bg-secondary text-primary text-[10px]">
                <Star className="size-3 fill-white" /> {item.score}
              </span>
            )}
            <span className="text-[10px] text-text">
              {getStatusLabel(item.status.toUpperCase()) ?? item.status}
            </span>
            {entry?.progress != null && item.episodes && (
              <div className="flex items-center gap-1">
                <div className="windows95-border w-20 h-3.5 bg-white relative overflow-hidden">
                  <div
                    className="h-full bg-secondary"
                    style={{
                      width: `${Math.min(100, Math.round((entry.progress / item.episodes) * 100))}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] windows95-text">
                  {entry.progress}/{item.episodes}
                </span>
              </div>
            )}
            {entry?.progress != null &&
              entry?.progress > 0 &&
              !item.episodes && (
                <span className="px-1 bg-secondary text-white text-[10px]">
                  {entry.progress}
                </span>
              )}
            {!entry && item.episodes && (
              <span className="text-[10px] text-text">{item.episodes} эп.</span>
            )}
          </div>
        </section>

        {item.cover_url && (
          <Image
            src={item.cover_url}
            alt={item.title + " cover"}
            className="w-14 h-full windows95-active-border shrink-0"
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
