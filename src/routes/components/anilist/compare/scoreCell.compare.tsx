import { useI18n } from "@/hooks/i18n.hook";
import { formatScore } from "@/lib/anilist/anilistScore.utils";
import { formatNormalizedScore } from "@/lib/core/compare.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import { StatusMark } from "@/routes/components/anilist/compare/statusMark.compare";

export function ScoreCell({
  score,
  raw,
  format,
  status,
  progress,
  episodes,
  rawLabel,
}: {
  score: number | null;
  raw: number | null;
  format: AnilistScoreFormat;
  status: string;
  progress: number | null;
  episodes: number | null;
  rawLabel: string;
}) {
  const { t } = useI18n();
  const rawScore = formatScore(raw, format);
  return (
    <div
      className="flex min-w-0 flex-col items-end gap-0.5"
      title={
        raw == null
          ? undefined
          : t("anilist.compare.score.raw", { label: rawLabel, score: rawScore })
      }
    >
      <span className="windows95-text text-xs font-bold">{formatNormalizedScore(score)}</span>
      <StatusMark status={status} />
      {progress != null && (
        <span className="windows95-text text-hint text-xs">
          {episodes == null ? progress : `${progress}/${episodes}`}
        </span>
      )}
    </div>
  );
}
