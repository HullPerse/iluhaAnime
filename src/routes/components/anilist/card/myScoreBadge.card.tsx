import { ScoreIcon } from "./scoreIcon.card";
import { formatEntryScore } from "@/lib/anilist/anilistScore.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";

export function MyScoreBadge({
  score,
  format,
  title,
}: {
  score: number | null | undefined;
  format: AnilistScoreFormat;
  title: string;
}) {
  const display = formatEntryScore(score, format);
  if (!display) return null;
  if (format === "POINT_3") {
    return (
      <span
        className="bg-secondary text-primary flex shrink-0 flex-row items-center gap-0.5 px-1 text-xs whitespace-nowrap"
        title={title}
        aria-label={title}
      >
        <ScoreIcon format={format} score={score ?? 0} />
      </span>
    );
  }
  return (
    <span
      className="bg-secondary text-primary flex shrink-0 flex-row items-center gap-0.5 px-1 text-xs whitespace-nowrap"
      title={title}
    >
      <ScoreIcon format={format} score={score ?? 0} /> {display}
    </span>
  );
}
