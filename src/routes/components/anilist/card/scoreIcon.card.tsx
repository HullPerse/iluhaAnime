import { ScoreGlyph } from "@/components/shared/scoreGlyph.component";
import { parseScoreFormat, scoreIconFor } from "@/lib/anilist/anilistScore.utils";

export function ScoreIcon({
  format,
  score,
}: {
  format: ReturnType<typeof parseScoreFormat>;
  score: number;
}) {
  return <ScoreGlyph icon={scoreIconFor(format, score)} />;
}
