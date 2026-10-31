import { ScoreGlyph } from "@/components/shared/scoreGlyph.component";
import { scoreIconFor } from "@/lib/anilist/anilistScore.utils";

export function FriendScoreIcon({ score }: { score: number | null }) {
  return <ScoreGlyph icon={scoreIconFor("POINT_3", score)} />;
}
