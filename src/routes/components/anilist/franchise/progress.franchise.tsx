import ProgressBar from "@/components/shared/progress.component";

export function FranchiseProgress({
  progress,
  aired,
  label,
  episodesShort,
}: {
  progress: number | null;
  aired: number;
  label: string;
  episodesShort: string;
}) {
  if (progress == null) return null;
  if (aired > 0) {
    const done = Math.min(progress, aired);
    return (
      <span className="flex items-center gap-1">
        <ProgressBar
          value={done}
          max={aired}
          className="inline-flex h-3.5 w-20"
          slots
          ariaLabel={label}
        />
        <span className="text-hint">
          {done}/{aired}
        </span>
      </span>
    );
  }
  if (progress <= 0) return null;
  return (
    <span className="text-hint">
      {progress} {episodesShort}
    </span>
  );
}
