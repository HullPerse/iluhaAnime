import ProgressBar from "@/components/shared/progress.component";
import { ProgressStepper } from "@/routes/components/anilist/stepper.anilist";
import type { EntryListInfo } from "@/types/anilist/entries";
import type { AniCardProps } from "@/types/anilist/anilistUi";

export function CardProgressBlock({
  item,
  entry,
  progress,
}: {
  item: AniCardProps["item"];
  entry: EntryListInfo | undefined;
  progress: number | null;
}) {
  if (entry?.progress == null || progress == null) return null;

  const total = item.media_type === "MANGA" ? item.chapters : item.episodes;

  if (typeof total === "number" && total > 0) {
    return (
      <div className="flex items-center gap-1">
        <ProgressStepper media={{ ...item, episodes: total }} entry={entry} progress={progress} />
        <ProgressBar value={progress} max={total} className="h-3.5 w-20" slots />
        <span className="windows95-text text-xs">
          {progress}/{total}
        </span>
      </div>
    );
  }

  if (progress > 0) {
    return <span className="bg-secondary text-title-text px-1 text-xs">{progress}</span>;
  }

  return null;
}
