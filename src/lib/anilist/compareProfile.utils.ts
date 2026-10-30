import { formatMeanScore, parseScoreFormat } from "@/lib/anilist/anilistScore.utils";
import type { AniUser } from "@/types/anilist/anilist";

const FALLBACK_AVATAR = "/images/user_avatar.ico";

export function toProfileProps(
  user: Pick<AniUser, "avatar" | "name" | "anime_count" | "mean_score" | "score_format"> | null,
  fallback: string
): { avatar: string; title: string; subtitle: string } {
  const mean = formatMeanScore(user?.mean_score, parseScoreFormat(user?.score_format));
  return {
    avatar: user?.avatar || FALLBACK_AVATAR,
    title: user?.name ?? fallback,
    subtitle: `${user?.anime_count ?? 0} - ${mean ?? "-"}`,
  };
}

export function percent(value: number | null): string {
  return value == null ? "-" : `${value}%`;
}
