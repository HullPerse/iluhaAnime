import ProgressBar from "@/components/shared/progress.component";
import { ProgressStepper } from "@/routes/components/anilist/stepper.anilist";
import type { EntryListInfo } from "@/types/anilist/entries";
import type { AniCardProps } from "@/types/anilist/anilist";

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
  if (typeof item.episodes === "number" && item.episodes > 0) {
    return (
      <div className="flex items-center gap-1">
        <ProgressStepper media={item} entry={entry} progress={progress} />
        <ProgressBar value={progress} max={item.episodes} className="h-3.5 w-20" slots />
        <span className="windows95-text text-xs">
          {progress}/{item.episodes}
        </span>
      </div>
    );
  }
  if (progress > 0) {
    return <span className="bg-secondary text-title-text px-1 text-xs">{progress}</span>;
  }
  return null;
}
